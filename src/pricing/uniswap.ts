// pricing for uniswap traded tokens and uniswap LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { UniswapFactory } from '../../generated/templates/GeyserV1/UniswapFactory'
import { UniswapPair } from '../../generated/templates/GeyserV1/UniswapPair'
import { UniswapFactoryV3 } from '../../generated/templates/GeyserV1/UniswapFactoryV3'
import { UniswapPoolV3 } from '../../generated/templates/GeyserV1/UniswapPoolV3'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'

import { integerToDecimal } from '../util/common'
import {
  ZERO_BIG_DECIMAL,
  ZERO_BIG_INT,
  WRAPPED_NATIVE_ADDRESS,
  WETH_ADDRESS,
  USD_NATIVE_PAIR,
  USD_WETH_PAIR,
  STABLECOINS,
  UNISWAP_FACTORY,
  SUSHI_FACTORY,
  UNISWAP_FACTORY_V3,
  UNISWAP_FACTORY_V3_START_TIME,
  ZERO_ADDRESS,
  MIN_USD_PRICING,
  STABLECOIN_DECIMALS
} from '../util/constants'



export function isUniswapLiquidityToken(address: Address): boolean {
  let pair = UniswapPair.bind(address);

  let res0 = pair.try_getReserves();
  if (res0.reverted) {
    return false;
  }
  let res1 = pair.try_factory();
  if (res1.reverted) {
    return false;
  }
  return true;
}


export function getUniswapLiquidityTokenAlias(address: Address): string {
  let pair = UniswapPair.bind(address);

  let token0 = ERC20.bind(pair.token0());
  let token1 = ERC20.bind(pair.token1());

  let alias = token0.symbol() + '-' + token1.symbol();
  return alias;
}


export function getNativePrice(): BigDecimal {
  // NOTE: if updating this constant address, we assume that the native token is token0
  let pair = UniswapPair.bind(Address.fromString(USD_NATIVE_PAIR));
  let reserves = pair.getReserves();
  let wnative = integerToDecimal(reserves.value0)  // wrapped native 18 decimals
  let usd = integerToDecimal(reserves.value1, BigInt.fromI32(6))  // usd 6 decimals
  return usd.div(wnative);
}


export function getEthPrice(): BigDecimal {
  // NOTE: if updating this constant address, we assume that weth is token0
  let pair = UniswapPair.bind(Address.fromString(USD_WETH_PAIR));
  let reserves = pair.getReserves();
  let weth = integerToDecimal(reserves.value0)  // weth 18 decimals
  let usd = integerToDecimal(reserves.value1, BigInt.fromI32(6))  // usd 6 decimals
  return usd.div(weth);
}


var cache = new Map<Address, BigDecimal>()


export function getTokenPrice(address: Address, decimals: BigInt, hint: String, timestamp: BigInt): BigDecimal {

  // if (cache.size > 0) {
  //   log.info("cache size: {}", [BigInt.fromI32(cache.size).toString()]);
  // }

  if (cache.has(address)) {
    // log.info("pricing debug value cached... addr: {} price: {}, ts: {}",
    //   [address.toHexString(), cache.get(address).toString(), timestamp.toString()]
    // );
    return cache.get(address);
  }

  // early exit for stables
  if (STABLECOINS.includes(address.toHexString())) {
    return BigDecimal.fromString('1.0');
  }
  if (address.toHexString() == WRAPPED_NATIVE_ADDRESS) {
    let price = getNativePrice();
    cache.set(address, price);
    return price;
  }
  if (address.toHexString() == WETH_ADDRESS) {
    let price = getEthPrice();
    cache.set(address, price);
    return price;
  }

  // TODO try previous pricing hint first

  // setup
  let zero = Address.fromString(ZERO_ADDRESS);

  let stables: string[] = [WRAPPED_NATIVE_ADDRESS];
  let stableDecimals: number[] = [18];
  stables = stables.concat(STABLECOINS);
  stableDecimals = stableDecimals.concat(STABLECOIN_DECIMALS);
  if (WETH_ADDRESS != ZERO_ADDRESS) {
    stables = stables.concat([WETH_ADDRESS]);
    stableDecimals = stableDecimals.concat([18]);
  }

  let factories: string[] = [UNISWAP_FACTORY, SUSHI_FACTORY];

  // try each uniswap factory (or clone)
  for (let i = 0; i < factories.length; i++) {
    let factory = UniswapFactory.bind(Address.fromString(factories[i]));

    // try each stable
    for (let j = 0; j < stables.length; j++) {
      let pairAddress = factory.getPair(address, Address.fromString(stables[j]));

      if (pairAddress == zero) {
        continue;
      }

      let pair = UniswapPair.bind(pairAddress);
      let reserves = pair.getReserves();

      let stable: BigDecimal, tokenReserve: BigInt
      if (pair.token0() == address) {
        stable = integerToDecimal(reserves.value1, BigInt.fromI32(stableDecimals[j] as i32));
        tokenReserve = reserves.value0;
      } else {
        stable = integerToDecimal(reserves.value0, BigInt.fromI32(stableDecimals[j] as i32));
        tokenReserve = reserves.value1;
      }

      // convert native or weth to usd
      if (j == 0) {
        let native = getNativePrice();
        stable = stable.times(native);
      } else if (j == 5) {
        let eth = getEthPrice();
        stable = stable.times(eth);
      }

      if (stable.lt(MIN_USD_PRICING)) {
        continue;
      }

      // compute price
      let amount = integerToDecimal(tokenReserve, decimals);
      let price = stable.div(amount);

      // cache price
      cache.set(address, price);

      return price; // hint = 'univ2:' + factories[i] + ':' + stables[j];
    }
  }

  // try uniswap v3 pricing
  if (timestamp < UNISWAP_FACTORY_V3_START_TIME) {
    return ZERO_BIG_DECIMAL;
  }
  let factory = UniswapFactoryV3.bind(Address.fromString(UNISWAP_FACTORY_V3));
  let fees: number[] = [3000, 10000]; // 500];

  // try each stable and fee tier
  for (let i = 0; i < stables.length; i++) {
    for (let j = 0; j < fees.length; j++) {
      let poolAddress = factory.getPool(address, Address.fromString(stables[i]), fees[j] as i32);

      if (poolAddress == zero) {
        continue;
      }

      let stablePrice = BigDecimal.fromString('1.0');
      if (i == 0) {
        stablePrice = getNativePrice();
      } else if (i == 5) {
        stablePrice = getEthPrice();
      }

      let stableERC20 = ERC20.bind(Address.fromString(stables[i]));
      let stableAmount = integerToDecimal(stableERC20.balanceOf(poolAddress), BigInt.fromI32(stableDecimals[i] as i32));
      if ((stableAmount.times(stablePrice)).lt(MIN_USD_PRICING)) {
        continue;
      }

      let pool = UniswapPoolV3.bind(poolAddress);

      if (pool.liquidity() == ZERO_BIG_INT) {
        continue;
      }

      // compute price
      let slot0 = pool.slot0();
      let sqrtPriceX96 = slot0.value0;
      let price = (sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()).div(
        BigInt.fromI32(2).pow(96 * 2).toBigDecimal() // effective bit shift >> (96*2)
      );

      if (pool.token1() == address) {
        price = BigDecimal.fromString('1.0').div(price);
      }

      price = price
        .times(BigInt.fromI32(10).pow(decimals.toI32() as u8).toBigDecimal())
        .div(BigInt.fromI32(10).pow(stableDecimals[i] as u8).toBigDecimal());

      price = price.times(stablePrice);

      //log.info("pricing debug {} @ {} with v3 {} {} {}",
      //  [address.toHexString(), price.toString(), i.toString(), j.toString(), (stableAmount.times(stablePrice)).toString()]
      //);

      // cache price
      cache.set(address, price);

      return price; // 'univ3:' + stables[i] + ':' + BigInt.fromI32(fees[j] as i32).toString();
    }
  }

  return ZERO_BIG_DECIMAL;
}


export function getUniswapLiquidityTokenPrice(address: Address, timestamp: BigInt): BigDecimal {
  let pair = UniswapPair.bind(address);

  let totalSupply = integerToDecimal(pair.totalSupply());
  if (totalSupply == ZERO_BIG_DECIMAL) {
    return ZERO_BIG_DECIMAL;
  }

  let reserves = pair.getReserves();

  // try to price with token 0
  let token0 = ERC20.bind(pair.token0());
  let decimals0 = BigInt.fromI32(token0.decimals());
  let price0 = getTokenPrice(token0._address, decimals0, "", timestamp);

  if (price0.gt(ZERO_BIG_DECIMAL)) {
    let amount0 = integerToDecimal(reserves.value0, decimals0);
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price0.times(amount0));

    return totalReservesUSD.div(totalSupply);
  }

  // try to price with token 1
  let token1 = ERC20.bind(pair.token1());
  let decimals1 = BigInt.fromI32(token1.decimals());
  let price1 = getTokenPrice(token1._address, decimals1, "", timestamp);

  if (price1.gt(ZERO_BIG_DECIMAL)) {
    let amount1 = integerToDecimal(reserves.value1, decimals1);
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price1.times(amount1));

    return totalReservesUSD.div(totalSupply);
  }

  return ZERO_BIG_DECIMAL;
}

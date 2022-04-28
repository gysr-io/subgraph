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


export class Price {
  price: BigDecimal;
  hint: String;
  constructor(price: BigDecimal, hint: String) {
    this.price = price;
    this.hint = hint;
  }
}


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


export function getUniswapLiquidityTokenUnderlying(address: Address): Array<string> {
  let pair = UniswapPair.bind(address);
  let token0 = pair.token0();
  let token1 = pair.token1();

  return [token0.toHexString(), token1.toHexString()];
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


export function getTokenPrice(address: Address, decimals: BigInt, hint: String, timestamp: BigInt): Price {

  // if (cache.size > 0) {
  //   log.info("cache size: {}", [BigInt.fromI32(cache.size).toString()]);
  // }

  if (cache.has(address)) {
    // log.info("pricing debug value cached... addr: {} price: {}, ts: {}",
    //   [address.toHexString(), cache.get(address).toString(), timestamp.toString()]
    // );
    return new Price(cache.get(address), hint);
  }

  // early exit for stables
  if (STABLECOINS.includes(address.toHexString())) {
    return new Price(BigDecimal.fromString('1.0'), 'stable');
  }
  if (address.toHexString() == WRAPPED_NATIVE_ADDRESS) {
    let price = getNativePrice();
    cache.set(address, price);
    return new Price(price, 'native');
  }
  if (address.toHexString() == WETH_ADDRESS) {
    let price = getEthPrice();
    cache.set(address, price);
    return new Price(price, 'eth');
  }

  // stables
  let zero = Address.fromString(ZERO_ADDRESS);

  let stables: string[] = [WRAPPED_NATIVE_ADDRESS];
  let stableDecimals: number[] = [18];
  stables = stables.concat(STABLECOINS);
  stableDecimals = stableDecimals.concat(STABLECOIN_DECIMALS);
  if (WETH_ADDRESS != ZERO_ADDRESS) {
    stables = stables.concat([WETH_ADDRESS]);
    stableDecimals = stableDecimals.concat([18]);
  }

  // try previous pricing hint first
  if (hint.length) {
    // log.info("pricing hint debug trying {} {}", [address.toHexString(), hint.toString()]);
    let parts = hint.split(':');
    let price = ZERO_BIG_DECIMAL;
    let idx = BigInt.fromString(parts[1]).toI32();

    if (parts[0] == 'univ2') {
      price = _getPriceUniV2(
        address,
        decimals,
        Address.fromString(stables[idx]),
        BigInt.fromI32(stableDecimals[idx] as i32),
        Address.fromString(parts[2])
      );

    } else if (parts[0] == 'univ3') {
      price = _getPriceUniV3(
        address,
        decimals,
        Address.fromString(stables[idx]),
        BigInt.fromI32(stableDecimals[idx] as i32),
        Address.fromString(parts[2])
      );
    }

    if (price != ZERO_BIG_DECIMAL) {
      //log.info("pricing hint debug success {} {} {} {}", [address.toHexString(), hint.toString(), idx.toString(), price.toString()]);
      cache.set(address, price);
      return new Price(price, hint);
    }
    //log.info("pricing hint debug failed {} {} {}", [address.toHexString(), hint.toString(), idx.toString()]);
  }

  let factories: string[] = [UNISWAP_FACTORY, SUSHI_FACTORY];

  // try each uniswap factory (or clone)
  for (let i = 0; i < factories.length; i++) {
    let factory = UniswapFactory.bind(Address.fromString(factories[i]));

    // try each stable
    for (let j = 0; j < stables.length; j++) {
      let poolAddress = factory.getPair(address, Address.fromString(stables[j]));

      if (poolAddress == zero) {
        continue;
      }

      let price = _getPriceUniV2(
        address,
        decimals,
        Address.fromString(stables[j]),
        BigInt.fromI32(stableDecimals[j] as i32),
        poolAddress
      );

      if (price == ZERO_BIG_DECIMAL) {
        continue;
      }

      // cache price
      cache.set(address, price);

      return new Price(price, 'univ2:' + j.toString() + ':' + poolAddress.toHexString());
    }
  }

  // try uniswap v3 pricing
  if (timestamp < UNISWAP_FACTORY_V3_START_TIME) {
    return new Price(ZERO_BIG_DECIMAL, '');
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

      let price = _getPriceUniV3(
        address,
        decimals,
        Address.fromString(stables[i]),
        BigInt.fromI32(stableDecimals[i] as i32),
        poolAddress
      );

      if (price == ZERO_BIG_DECIMAL) {
        continue;
      }

      //log.info("pricing debug {} @ {} with v3 {} {} {}",
      //  [address.toHexString(), price.toString(), i.toString(), j.toString(), (stableAmount.times(stablePrice)).toString()]
      //);

      // cache price
      cache.set(address, price);

      return new Price(price, 'univ3:' + i.toString() + ':' + poolAddress.toHexString());
    }
  }

  return new Price(ZERO_BIG_DECIMAL, '');
}



function _getPriceUniV2(address: Address, decimals: BigInt, stableAddress: Address, stableDecimals: BigInt, poolAddress: Address): BigDecimal {

  let pool = UniswapPair.bind(poolAddress);
  let reserves = pool.getReserves();

  let stable: BigDecimal, tokenReserve: BigInt
  let token0 = pool.token0();
  if (token0 == address) {
    stable = integerToDecimal(reserves.value1, stableDecimals);
    tokenReserve = reserves.value0;
  } else if (token0 == stableAddress) {
    stable = integerToDecimal(reserves.value0, stableDecimals);
    tokenReserve = reserves.value1;
  } else {
    log.error('Invalid pool {} for pricing token {}', [poolAddress.toHexString(), address.toHexString()]);
  }

  // convert native or weth to usd
  if (stableAddress == Address.fromString(WRAPPED_NATIVE_ADDRESS)) {
    let native = getNativePrice();
    stable = stable.times(native);
  } else if (stableAddress == Address.fromString(WETH_ADDRESS)) {
    let eth = getEthPrice();
    stable = stable.times(eth);
  }

  if (stable.lt(MIN_USD_PRICING)) {
    return ZERO_BIG_DECIMAL;
  }

  // compute price
  let amount = integerToDecimal(tokenReserve, decimals);
  return stable.div(amount);
}



function _getPriceUniV3(address: Address, decimals: BigInt, stableAddress: Address, stableDecimals: BigInt, poolAddress: Address): BigDecimal {

  let stablePrice = BigDecimal.fromString('1.0');
  if (stableAddress == Address.fromString(WRAPPED_NATIVE_ADDRESS)) {
    stablePrice = getNativePrice();
  } else if (stableAddress == Address.fromString(WETH_ADDRESS)) {
    stablePrice = getEthPrice();
  }

  let stableERC20 = ERC20.bind(stableAddress);
  let stableAmount = integerToDecimal(stableERC20.balanceOf(poolAddress), stableDecimals);
  if ((stableAmount.times(stablePrice)).lt(MIN_USD_PRICING)) {
    return ZERO_BIG_DECIMAL;
  }

  let pool = UniswapPoolV3.bind(poolAddress);

  if (pool.liquidity() == ZERO_BIG_INT) {
    return ZERO_BIG_DECIMAL;
  }

  // compute price
  let slot0 = pool.slot0();
  let sqrtPriceX96 = slot0.value0;
  let price = (sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()).div(
    BigInt.fromI32(2).pow(96 * 2).toBigDecimal() // effective bit shift >> (96*2)
  );

  let token1 = pool.token1();
  if (token1 == address) {
    price = BigDecimal.fromString('1.0').div(price);
  } else if (token1 != stableAddress) {
    log.error('Invalid pool {} for pricing token {}', [poolAddress.toHexString(), address.toHexString()]);
  }

  price = price
    .times(BigInt.fromI32(10).pow(decimals.toI32() as u8).toBigDecimal())
    .div(BigInt.fromI32(10).pow(stableDecimals.toI32() as u8).toBigDecimal());

  return price.times(stablePrice);
}



export function getUniswapLiquidityTokenPrice(address: Address, hint: String, timestamp: BigInt): Price {
  let pair = UniswapPair.bind(address);

  let totalSupply = integerToDecimal(pair.totalSupply());
  if (totalSupply == ZERO_BIG_DECIMAL) {
    return new Price(ZERO_BIG_DECIMAL, '');
  }

  let hint0: String = '', hint1: String = '';
  let parts = hint.split('/');
  if (parts.length == 2) {
    hint0 = parts[0];
    hint1 = parts[1];
  }

  let reserves = pair.getReserves();

  // try to price with token 0
  let token0 = ERC20.bind(pair.token0());
  let decimals0 = BigInt.fromI32(token0.decimals());
  let price0 = getTokenPrice(token0._address, decimals0, hint0, timestamp);

  if (price0.price.gt(ZERO_BIG_DECIMAL)) {
    let amount0 = integerToDecimal(reserves.value0, decimals0);
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price0.price.times(amount0));

    return new Price(totalReservesUSD.div(totalSupply), price0.hint + '/');
  }

  // try to price with token 1
  let token1 = ERC20.bind(pair.token1());
  let decimals1 = BigInt.fromI32(token1.decimals());
  let price1 = getTokenPrice(token1._address, decimals1, hint1, timestamp);

  if (price1.price.gt(ZERO_BIG_DECIMAL)) {
    let amount1 = integerToDecimal(reserves.value1, decimals1);
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price1.price.times(amount1));

    return new Price(totalReservesUSD.div(totalSupply), '/' + price1.hint);
  }

  return new Price(ZERO_BIG_DECIMAL, '');
}

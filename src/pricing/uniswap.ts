// pricing for uniswap traded tokens and uniswap LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { UniswapFactory } from '../../generated/templates/Token/UniswapFactory'
import { UniswapPair } from '../../generated/templates/Token/UniswapPair'
import { Geyser as GeyserContract } from '../../generated/GeyserFactory/Geyser'
import { ERC20 } from '../../generated/GeyserFactory/ERC20'
import { Geyser, Token } from '../../generated/schema'
import { Geyser as GeyserTemplate } from '../../generated/templates'
import { integerToDecimal } from '../util/common'
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  WETH_ADDRESS,
  USDT_WETH_PAIR,
  STABLECOINS,
  UNISWAP_FACTORY,
  ZERO_ADDRESS,
  MIN_ETH_PRICING,
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


export function getEthPrice(): BigDecimal {
  let pair = UniswapPair.bind(Address.fromString(USDT_WETH_PAIR));
  let reserves = pair.getReserves();
  let weth = integerToDecimal(reserves.value0)  // weth 18 decimals
  let usdt = integerToDecimal(reserves.value1, BigInt.fromI32(6))  // usdt 6 decimals
  return usdt.div(weth);
}


export function getTokenPrice(address: Address): BigDecimal {
  // early exit for stables
  if (STABLECOINS.includes(address.toHexString())) {
    return BigDecimal.fromString('1.0');
  }
  if (address.toHexString() == WETH_ADDRESS) {
    return getEthPrice();
  }

  // setup
  let factory = UniswapFactory.bind(Address.fromString(UNISWAP_FACTORY));
  let zero = Address.fromString(ZERO_ADDRESS);

  let stables: string[] = [WETH_ADDRESS];
  stables = stables.concat(STABLECOINS);
  let decimals: number[] = [18];
  decimals = decimals.concat(STABLECOIN_DECIMALS);

  // try each stable
  for (let i = 0; i < stables.length; i++) {
    let pairAddress = factory.getPair(address, Address.fromString(stables[i]));

    if (pairAddress != zero) {
      let pair = UniswapPair.bind(pairAddress);
      let reserves = pair.getReserves();

      let stable: BigDecimal, tokenReserve: BigInt
      let stableDecimals = BigInt.fromI32(decimals[i] as i32);
      if (pair.token0() == address) {
        stable = integerToDecimal(reserves.value1, stableDecimals);
        tokenReserve = reserves.value0;
      } else {
        stable = integerToDecimal(reserves.value0, stableDecimals);
        tokenReserve = reserves.value1;
      }

      // convert weth to usd
      if (i == 0) {
        let eth = getEthPrice();
        stable = stable.times(eth);
      }

      // compute price
      if (stable.gt(MIN_USD_PRICING)) {
        let token = ERC20.bind(address);
        let amount = integerToDecimal(tokenReserve, BigInt.fromI32(token.decimals()));

        return stable.div(amount);
      }
    }
  }

  return ZERO_BIG_DECIMAL;
}


export function getUniswapLiquidityTokenPrice(address: Address): BigDecimal {

  let pair = UniswapPair.bind(address);

  let reserves = pair.getReserves();

  let token0 = ERC20.bind(pair.token0());
  let token1 = ERC20.bind(pair.token1());

  let price0 = getTokenPrice(token0._address);
  let price1 = getTokenPrice(token1._address);

  if (price0 == ZERO_BIG_DECIMAL || price1 == ZERO_BIG_DECIMAL) {
    return ZERO_BIG_DECIMAL;
  }

  let amount0 = integerToDecimal(reserves.value0, BigInt.fromI32(token0.decimals()));
  let amount1 = integerToDecimal(reserves.value1, BigInt.fromI32(token1.decimals()));

  let totalReservesUSD = (price0.times(amount0)).plus(price1.times(amount1));

  let totalSupply = integerToDecimal(pair.totalSupply());

  return totalReservesUSD.div(totalSupply);
}

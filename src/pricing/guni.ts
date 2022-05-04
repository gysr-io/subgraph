// pricing tools for gelato g-uni tokens

import { Address, BigInt, BigDecimal, log, Bytes } from '@graphprotocol/graph-ts'
import { GUniPool } from '../../generated/templates/GeyserV1/GUniPool'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { integerToDecimal } from '../util/common'
import { getTokenPrice, Price } from './uniswap'
import { ZERO_BIG_DECIMAL, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'



export function isGUniLiquidityToken(address: Address): boolean {
  let pool = GUniPool.bind(address);

  let res0 = pool.try_gelatoRebalanceBPS();
  if (res0.reverted) {
    return false;
  }
  let res1 = pool.try_getUnderlyingBalances();
  if (res1.reverted) {
    return false;
  }
  return true;
}


export function getGUniLiquidityTokenAlias(address: Address): string {
  let pool = GUniPool.bind(address);

  let token0 = ERC20.bind(pool.token0());
  let token1 = ERC20.bind(pool.token1());

  let symbol0 = '', symbol1 = '';
  let res0 = token0.try_symbol();
  if (!res0.reverted) {
    symbol0 = res0.value;
  }
  let res1 = token1.try_symbol();
  if (!res1.reverted) {
    symbol1 = res1.value;
  }

  let alias = symbol0 + '-' + symbol1;
  return alias;
}


export function getGUniLiquidityTokenUnderlying(address: Address): Array<string> {
  let pool = GUniPool.bind(address);

  let token0 = pool.token0();
  let token1 = pool.token1();

  return [token0.toHexString(), token1.toHexString()];
}


export function getGUniLiquidityTokenPrice(address: Address, hint: String, timestamp: BigInt): Price {
  let pool = GUniPool.bind(address);

  let reserves = pool.getUnderlyingBalances();

  let token0 = ERC20.bind(pool.token0());
  let token1 = ERC20.bind(pool.token1());

  let decimals0 = BigInt.fromI32(token0.decimals());
  let decimals1 = BigInt.fromI32(token1.decimals());

  let hint0: String = '', hint1: String = '';
  let parts = hint.split('/');
  if (parts.length == 2) {
    hint0 = parts[0];
    hint1 = parts[1];
  }

  let price0 = getTokenPrice(token0._address, decimals0, hint0, timestamp);
  let price1 = getTokenPrice(token1._address, decimals1, hint1, timestamp);
  hint = price0.hint + '/' + price1.hint;

  if (price0.price == ZERO_BIG_DECIMAL || price1.price == ZERO_BIG_DECIMAL) {
    return new Price(ZERO_BIG_DECIMAL, hint);
  }

  let amount0 = integerToDecimal(reserves.value0, decimals0);
  let amount1 = integerToDecimal(reserves.value1, decimals1);

  let totalReservesUSD = (price0.price.times(amount0)).plus(price1.price.times(amount1));

  let totalSupply = integerToDecimal(pool.totalSupply());
  if (totalSupply == ZERO_BIG_DECIMAL) {
    return new Price(ZERO_BIG_DECIMAL, hint);
  }

  return new Price(totalReservesUSD.div(totalSupply), hint);
}

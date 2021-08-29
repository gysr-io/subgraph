// pricing for ironswap LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { IronSwapToken } from '../../generated/templates/GeyserV1/IronSwapToken'
import { IronSwap } from '../../generated/templates/GeyserV1/IronSwap'
import { integerToDecimal } from '../util/common'


export function isIronSwapLiquidityToken(address: Address): boolean {
  let token = IronSwapToken.bind(address);
  let res0 = token.try_swap();
  if (res0.reverted) {
    return false;
  }

  let pool = IronSwap.bind(res0.value);
  let res1 = pool.try_getVirtualPrice();
  if (res1.reverted) {
    return false;
  }

  return true;
}

export function getIronSwapLiquidityTokenPrice(address: Address): BigDecimal {
  // get contracts
  let token = IronSwapToken.bind(address);
  let pool = IronSwap.bind(token.swap());

  // get price
  let price = integerToDecimal(pool.getVirtualPrice());
  return price;
}

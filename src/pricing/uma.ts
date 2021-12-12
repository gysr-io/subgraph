// pricing tools for UMA KPI options

import { Address, BigInt, BigDecimal, log, Bytes } from '@graphprotocol/graph-ts'
import { UMASyntheticToken } from '../../generated/templates/GeyserV1/UMASyntheticToken'
import { UMALongShortPair } from '../../generated/templates/GeyserV1/UMALongShortPair'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_DECIMAL, ZERO_BIG_INT, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'



export function isUmaKpiOption(address: Address): boolean {
  let token = UMASyntheticToken.bind(address);

  let res0 = token.try_getMember(ZERO_BIG_INT);
  if (res0.reverted) {
    return false;
  }

  let lsp = UMALongShortPair.bind(res0.value);

  let res1 = lsp.try_longToken();
  if (res1.reverted) {
    return false;
  }

  return res1.value == address;
}


export function getUmaKpiOptionAlias(address: Address): string {
  let token = UMASyntheticToken.bind(address);
  let lsp = UMALongShortPair.bind(token.getMember(ZERO_BIG_INT));
  let collateral = ERC20.bind(lsp.collateralToken());

  return collateral.symbol()
}


export function getUmaKpiOptionPrice(address: Address): BigDecimal {
  // TODO
  return ZERO_BIG_DECIMAL;
}
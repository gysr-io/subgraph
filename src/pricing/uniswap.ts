// pricing for uniswap traded tokens and uniswap LP tokens

import { Address, BigInt, BigDecimal, log } from "@graphprotocol/graph-ts"
import { UniswapFactory } from "../../generated/templates/Token/UniswapFactory"
import { UniswapPair } from "../../generated/templates/Token/UniswapPair"
import { Geyser as GeyserContract } from "../../generated/GeyserFactory/Geyser"
import { ERC20 } from "../../generated/GeyserFactory/ERC20"
import { Geyser, Token } from "../../generated/schema"
import { Geyser as GeyserTemplate } from '../../generated/templates'
import { integerToDecimal } from "../util/common"
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL } from "../util/constants"


export function isUniswapToken(address: Address): boolean {
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

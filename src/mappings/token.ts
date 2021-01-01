// token event handling and mapping

import { Address, BigInt, BigDecimal, log } from "@graphprotocol/graph-ts"
import { ERC20 } from "../../generated/templates/Token/ERC20"
import { Geyser, Token } from "../../generated/schema"
import { integerToDecimal } from "../util/common"
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, HIGH_VOLUME_TOKENS } from "../util/constants"
import { isUniswapToken } from "../pricing/uniswap"


// factory function to define and populate new token entity
export function createNewToken(address: Address): Token {
  let tokenContract = ERC20.bind(address);

  // generic
  let token = new Token(tokenContract._address.toHexString())
  token.name = '';
  token.symbol = '';
  token.decimals = BigInt.fromI32(0);
  token.totalSupply = BigInt.fromI32(0);
  token.price = BigDecimal.fromString("1.0");

  let resName = tokenContract.try_name();
  if (!resName.reverted) {
    token.name = resName.value;
  }
  let resSymbol = tokenContract.try_symbol();
  if (!resSymbol.reverted) {
    token.symbol = resSymbol.value;
  }
  let resDecimals = tokenContract.try_decimals();
  if (!resDecimals.reverted) {
    token.decimals = BigInt.fromI32(resDecimals.value as i32);
  }
  let resSupply = tokenContract.try_totalSupply();
  if (!resSupply.reverted) {
    token.totalSupply = resSupply.value;
  }

  // token type
  if (isUniswapToken(address)) {
    log.error("token type UNI {} {}", [token.id, token.symbol])
  } else if (HIGH_VOLUME_TOKENS.includes(address.toHexString())) {
    log.error("token type HIGH VOL {} {}", [token.id, token.symbol])
  } else {
    log.error("token type STANDARD {} {}", [token.id, token.symbol])
  }

  return token;
}

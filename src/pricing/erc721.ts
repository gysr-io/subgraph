// pricing tools for erc721 tokens

import { Address, BigInt, BigDecimal, log, Bytes } from '@graphprotocol/graph-ts'
import { ERC721 } from '../../generated/templates/GeyserV1/ERC721'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_DECIMAL, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'


// TODO: Add support for pricing

export function isERC721Token(address: Address): boolean {
  let pool = ERC721.bind(address);

  let res = pool.try_supportsInterface(Bytes.fromHexString("0x80ac58cd") as Bytes);
  if (res.reverted) {
    return false;
  }

  return res.value;
}

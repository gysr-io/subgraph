// token event handling and mapping

import { Address, BigInt, BigDecimal, ethereum, log, dataSource } from '@graphprotocol/graph-ts'
import { ERC20, Transfer } from '../../generated/templates/Token/ERC20'
import { Token } from '../../generated/schema'
import {
  Token as TokenTemplate,
  HighVolumeToken as HighVolumeTokenTemplate
} from '../../generated/templates'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, HIGH_VOLUME_TOKENS, STABLECOINS, ZERO_BIG_DECIMAL } from '../util/constants'
import {
  getTokenPrice,
  isUniswapLiquidityToken,
  getUniswapLiquidityTokenAlias
} from '../pricing/uniswap'


// factory function to define and populate new token entity
export function createNewToken(address: Address): Token {
  let tokenContract = ERC20.bind(address);

  // generic
  let token = new Token(tokenContract._address.toHexString())
  token.name = '';
  token.symbol = '';
  token.decimals = BigInt.fromI32(0);
  token.totalSupply = BigInt.fromI32(0);
  token.price = ZERO_BIG_DECIMAL;
  token.alias = token.symbol;

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
  if (isUniswapLiquidityToken(address)) {
    token.alias = getUniswapLiquidityTokenAlias(address);
    log.info('created new token: Uniswap LP, {}, {}', [token.id, token.alias])

  } else if (HIGH_VOLUME_TOKENS.includes(address.toHexString())) {
    log.info('created new token: high volume, {}, {}', [token.id, token.symbol])
    //HighVolumeTokenTemplate.create(address);

  } else if (STABLECOINS.includes(address.toHexString())) {
    log.info('created new token: stablecoin, {}, {}', [token.id, token.symbol])
    token.price = BigDecimal.fromString('1.0');

  } else { //if (address == Address.fromString('0xbEa98c05eEAe2f3bC8c3565Db7551Eb738c8CCAb')) {
    TokenTemplate.create(address);
    log.info('created new token: standard, {}, {}', [token.id, token.symbol])
  }

  return token;
}

export function handleTransfer(event: Transfer): void {
  let price = getTokenPrice(event.address);

  let token = new Token(event.address.toHexString());
  token.price = price;
  token.save();
}


export function handleBlock(block: ethereum.Block): void {
  if (block.number.mod(BigInt.fromI32(20)).notEqual(ZERO_BIG_INT)) {
    return;
  }
  let price = getTokenPrice(dataSource.address());

  let token = new Token(dataSource.address().toHexString());
  token.price = price;
  token.save();
}

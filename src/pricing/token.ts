// token pricing methods

import { Address, BigInt, BigDecimal, ethereum, log, dataSource } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { Token } from '../../generated/schema'
import { ZERO_BIG_INT, HIGH_VOLUME_TOKENS, STABLECOINS, ZERO_BIG_DECIMAL } from '../util/constants'
import {
  getTokenPrice,
  isUniswapLiquidityToken,
  getUniswapLiquidityTokenAlias,
  getUniswapLiquidityTokenPrice
} from '../pricing/uniswap'


// factory function to define and populate new token entity
export function createNewToken(address: Address): Token {
  let tokenContract = ERC20.bind(address);

  // generic
  let token = new Token(tokenContract._address.toHexString())
  token.name = '';
  token.symbol = '';
  token.alias = '';
  token.decimals = BigInt.fromI32(0);
  token.totalSupply = BigInt.fromI32(0);
  token.price = ZERO_BIG_DECIMAL;
  token.updated = ZERO_BIG_INT;

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
    token.type = 'UniswapLiquidity';
    log.info('created new token: Uniswap LP, {}, {}', [token.id, token.alias]);

  } else if (STABLECOINS.includes(address.toHexString())) {
    token.price = BigDecimal.fromString('1.0');
    token.type = 'Stable';
    log.info('created new token: stablecoin, {}, {}', [token.id, token.symbol]);

  } else if (HIGH_VOLUME_TOKENS.includes(address.toHexString())) {
    token.type = 'Standard';
    log.info('created new token: high volume, {}, {}', [token.id, token.symbol])

  } else { //if (address == Address.fromString('0xbEa98c05eEAe2f3bC8c3565Db7551Eb738c8CCAb')) {
    token.type = 'Standard';
    log.info('created new token: standard, {}, {}', [token.id, token.symbol]);
  }

  return token;
}


export function getPrice(token: Token): BigDecimal {
  // only price tokens on mainnet
  if (dataSource.network() != 'mainnet' && dataSource.network() != 'matic') {
    return BigDecimal.fromString('1.0');
  }

  // price token based on type
  if (token.type == 'Stable') {
    return BigDecimal.fromString('1.0');

  } else if (token.type == 'Standard') {
    return getTokenPrice(Address.fromString(token.id.toString()));

  } else if (token.type == 'UniswapLiquidity') {
    return getUniswapLiquidityTokenPrice(Address.fromString(token.id.toString()));
  }

  return ZERO_BIG_DECIMAL;
}

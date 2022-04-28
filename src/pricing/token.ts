// token pricing methods

import { Address, BigInt, BigDecimal, ethereum, log, dataSource } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { Token } from '../../generated/schema'
import { ZERO_BIG_INT, STABLECOINS, ZERO_BIG_DECIMAL } from '../util/constants'
import {
  getTokenPrice,
  isUniswapLiquidityToken,
  getUniswapLiquidityTokenAlias,
  getUniswapLiquidityTokenPrice,
  Price
} from '../pricing/uniswap'
import { getBalancerLiquidityTokenPrice, isBalancerLiquidityToken } from './balancer'
import { getUmaKpiOptionAlias, isUmaKpiOption } from './uma'
import { isERC721Token } from './erc721'
import { isGUniLiquidityToken, getGUniLiquidityTokenAlias, getGUniLiquidityTokenPrice } from './guni'


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
  token.hint = '';
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

  } else if (isBalancerLiquidityToken(address)) {
    token.type = 'BalancerLiquidity';
    log.info('created new token: Balancer Weighted LP, {}, {}', [token.id, token.symbol]);

  } else if (STABLECOINS.includes(address.toHexString())) {
    token.price = BigDecimal.fromString('1.0');
    token.type = 'Stable';
    log.info('created new token: stablecoin, {}, {}', [token.id, token.symbol]);

  } else if (isUmaKpiOption(address)) {
    token.alias = getUmaKpiOptionAlias(address);
    token.type = 'UmaKpiOption';
    log.info('created new token: UMA KPI Option, {}, {}', [token.id, token.symbol]);

  } else if (isERC721Token(address)) {
    token.type = 'ERC721';
    log.info('created new token: ERC721, {}, {}', [token.id, token.symbol]);

  } else if (isGUniLiquidityToken(address)) {
    token.alias = getGUniLiquidityTokenAlias(address);
    token.type = 'GUniLiquidity';
    log.info('created new token: ERC721, {}, {}', [token.id, token.symbol]);

  } else {
    token.type = 'Standard';
    log.info('created new token: standard, {}, {}', [token.id, token.symbol]);
  }

  return token;
}

export function getPrice(token: Token, timestamp: BigInt): BigDecimal {
  // only price tokens on mainnet
  if (dataSource.network() != 'mainnet' && dataSource.network() != 'matic') {
    return BigDecimal.fromString('1.0');
  }

  // price token based on type
  let price = new Price(ZERO_BIG_DECIMAL, '');
  if (token.type == 'Stable') {
    price = new Price(BigDecimal.fromString('1.0'), 'stable');
  } else if (token.type == 'Standard') {
    price = getTokenPrice(Address.fromString(token.id.toString()), token.decimals, token.hint, timestamp);
  } else if (token.type == 'UniswapLiquidity') {
    price = getUniswapLiquidityTokenPrice(Address.fromString(token.id.toString()), token.hint, timestamp);
  } else if (token.type == 'BalancerLiquidity') {
    price = getBalancerLiquidityTokenPrice(Address.fromString(token.id.toString()), token.hint, timestamp);
  } else if (token.type == 'GUniLiquidity') {
    price = getGUniLiquidityTokenPrice(Address.fromString(token.id.toString()), token.hint, timestamp);
  }

  // cache price
  token.price = price.price;
  token.hint = price.hint.toString();

  return price.price;
}

// pricing for balancer traded tokens and balancer LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { BalancerWeightedPool } from '../../generated/templates/GeyserV1/BalancerWeightedPool'
import { BalancerVault } from '../../generated/templates/GeyserV1/BalancerVault'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_DECIMAL, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'
import { getTokenPrice, Price } from './uniswap'

// TODO: Add support for more pools other than Weighted Pools.

export function isBalancerLiquidityToken(address: Address): boolean {
  let pool = BalancerWeightedPool.bind(address);

  let res0 = pool.try_getNormalizedWeights();
  if (res0.reverted) {
    return false;
  }
  let res1 = pool.try_getVault();
  if (res1.reverted) {
    return false;
  }
  return true;
}


export function getBalancerLiquidityTokenUnderlying(address: Address): Array<string> {
  let pool = BalancerWeightedPool.bind(address);
  let vaultId = pool.getVault();
  let vault = BalancerVault.bind(vaultId);
  let poolId = pool.getPoolId();

  let poolTokens = vault.getPoolTokens(poolId);
  let tokenAddresses = poolTokens.value0;

  let underlying: string[] = [];
  for (let i = 0; i < tokenAddresses.length; i++) {
    underlying.push(tokenAddresses[i].toHexString());
  }

  return underlying;
}


export function getBalancerLiquidityTokenPrice(address: Address, hint: String, timestamp: BigInt): Price {
  // get contracts
  let pool = BalancerWeightedPool.bind(address);
  let vaultId = pool.getVault();
  let vault = BalancerVault.bind(vaultId);
  let poolId = pool.getPoolId();

  // get pool stats
  let poolTokens = vault.getPoolTokens(poolId);
  let tokenAddresses = poolTokens.value0;
  let tokenBalances = poolTokens.value1;
  let weights = pool.getNormalizedWeights();
  let totalSupply = integerToDecimal(pool.totalSupply());

  // find stable coin
  let stableCoinPoolIdx: i32 = -1;
  let stableCoinIdx: i32 = -1;
  for (let i = 0; i < tokenAddresses.length; i++) {
    for (let j = 0; j < STABLECOINS.length; j++) {
      if (Address.fromString(STABLECOINS[j]).toHexString() == tokenAddresses[i].toHexString()) {
        stableCoinPoolIdx = i;
        stableCoinIdx = j;
        break;
      }
    }
    if (stableCoinPoolIdx > -1) {
      break;
    }
  }

  if (stableCoinPoolIdx > -1) {
    // get balance of stable coin
    let stableBalance = integerToDecimal(tokenBalances[stableCoinPoolIdx], BigInt.fromI32(STABLECOIN_DECIMALS[stableCoinIdx] as i32));
    // get stable coin weight
    let stableWeight = integerToDecimal(weights[stableCoinPoolIdx]);
    return new Price(getPriceFromWeight(stableBalance, stableWeight, BigDecimal.fromString('1'), totalSupply), stableCoinPoolIdx.toString() + '/stable')
  } else {
    // parse hint
    let tokenHint: String = '';
    let tokenHintIdx: i32 = -1
    let parts = hint.split('/');
    if (parts.length == 2) {
      tokenHint = parts[1];
      tokenHintIdx = BigInt.fromString(parts[0]).toI32();
    }

    // try to price against a token on uniswap
    for (let i = 0; i < tokenAddresses.length; i++) {
      let tokenContract = ERC20.bind(tokenAddresses[i]);
      let tokenDecimals = BigInt.fromI32(tokenContract.decimals());
      let tokenPrice = getTokenPrice(tokenAddresses[i], tokenDecimals, i == tokenHintIdx ? tokenHint : '', timestamp);
      if (tokenPrice.price == ZERO_BIG_DECIMAL) {
        continue;
      }
      let tokenAmount = integerToDecimal(tokenBalances[i], tokenDecimals);
      let tokenWeight = integerToDecimal(weights[i]);
      return new Price(getPriceFromWeight(tokenAmount, tokenWeight, tokenPrice.price, totalSupply), i.toString() + "/" + tokenPrice.hint);
    }
  }

  return new Price(ZERO_BIG_DECIMAL, '');
}

function getPriceFromWeight(tokenBalance: BigDecimal, tokenWeight: BigDecimal, tokenPrice: BigDecimal, totalSupply: BigDecimal): BigDecimal {
  let tvl = tokenBalance.times(tokenPrice).div(tokenWeight);
  return tvl.div(totalSupply);
}

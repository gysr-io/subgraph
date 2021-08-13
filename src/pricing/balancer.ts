// pricing for balancer traded tokens and balancer LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { BalancerWeightedPool } from '../../generated/templates/GeyserV1/BalancerWeightedPool'
import { BalancerVault } from '../../generated/templates/GeyserV1/BalancerVault'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_DECIMAL, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'
import { Token } from '../../generated/schema'

// TODO: Add support for more pools other than Weighted Pools.

export function isBalancerLiquidityToken(address: Address): boolean {
  let pool = BalancerWeightedPool.bind(address);

  let res = pool.try_getNormalizedWeights();
  if (res.reverted) {
    return false;
  }
  return true;
}

export function getBalancerLiquidityTokenPrice(address: Address): BigDecimal {
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
  let stableCoinPoolIndex: i32 = -1;
  let foundStableCoin: i32 = -1;
  for (let i = 0; i < tokenAddresses.length; i++) {
    for (let j = 0; j < STABLECOINS.length; j++) {
      if (Address.fromString(STABLECOINS[j]).toHexString() == tokenAddresses[i].toHexString()) {
        stableCoinPoolIndex = i;
        foundStableCoin = j;
        break;
      }
    }
    if (stableCoinPoolIndex > -1) {
      break;
    }
  }

  if (stableCoinPoolIndex > -1) {
    // get balance of stable coin
    let stableBalance = integerToDecimal(tokenBalances[stableCoinPoolIndex], BigInt.fromI32(STABLECOIN_DECIMALS[foundStableCoin] as i32));
    // get stable coin weight
    let stableWeight = integerToDecimal(weights[stableCoinPoolIndex]);
    return getPriceFromWeight(stableBalance, stableWeight, BigDecimal.fromString('1'), totalSupply)
  } else {
    // try to price against a token we have saved
    for (let i = 0; i < tokenAddresses.length; i++) {
      let pricedToken = Token.load(tokenAddresses[i].toHexString());
      if (pricedToken === null) {
        continue;
      }
      let pricedTokenBalance = integerToDecimal(tokenBalances[i], pricedToken.decimals);
      let pricedTokenWeight = integerToDecimal(weights[i]);
      return getPriceFromWeight(pricedTokenBalance, pricedTokenWeight, pricedToken.price, totalSupply)
    }
  }

  return ZERO_BIG_DECIMAL;
}

function getPriceFromWeight(tokenBalance: BigDecimal, tokenWeight: BigDecimal, tokenPrice: BigDecimal, totalSupply: BigDecimal): BigDecimal {
  let tvl = tokenBalance.times(tokenPrice).div(tokenWeight);
  return tvl.div(totalSupply);
}

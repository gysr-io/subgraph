// utilities for Geyser V1 updates and pricing

import { BigInt, log, store } from '@graphprotocol/graph-ts';
import { GeyserV1 as GeyserContractV1 } from '../../generated/templates/GeyserV1/GeyserV1';
import { Pool, Token, Platform, PoolStakingToken, PoolRewardToken } from '../../generated/schema';
import { integerToDecimal } from '../util/common';
import { ZERO_BIG_INT, INITIAL_SHARES_PER_TOKEN } from '../util/constants';
import { getPrice } from '../pricing/token';
import { updatePricing } from '../pricing/pool';

export function updateGeyserV1(
  pool: Pool,
  platform: Platform,
  contract: GeyserContractV1,
  tokens: Map<String, Token>,
  stakingTokens: Map<String, PoolStakingToken>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  // tokens
  let stakingToken = tokens.get(stakingTokens.keys()[0])!;
  let rewardToken = tokens.get(rewardTokens.keys()[0])!;

  stakingToken.price = getPrice(stakingToken, timestamp);
  stakingToken.updated = timestamp;
  rewardToken.price = getPrice(rewardToken, timestamp);
  rewardToken.updated = timestamp;

  // token amounts
  let totalStaked = contract.totalStaked();
  let totalLocked = contract.totalLocked();
  stakingTokens.values()[0].amount = integerToDecimal(totalStaked, stakingToken.decimals);
  rewardTokens.values()[0].amount = integerToDecimal(totalLocked, rewardToken.decimals).plus(
    integerToDecimal(contract.totalUnlocked(), rewardToken.decimals)
  );
  pool.staked = stakingTokens.values()[0].amount;
  pool.rewards = rewardTokens.values()[0].amount;

  // share/amount rate
  let stakingSharesPerToken = totalStaked.gt(ZERO_BIG_INT)
    ? contract
        .totalStakingShares()
        .toBigDecimal()
        .div(totalStaked.toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;
  let rewardSharesPerToken = totalLocked.gt(ZERO_BIG_INT)
    ? contract
        .totalLockedShares()
        .toBigDecimal()
        .div(totalLocked.toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;

  stakingTokens.values()[0].sharesPerToken = stakingSharesPerToken;
  rewardTokens.values()[0].sharesPerToken = rewardSharesPerToken;

  pool.stakingSharesPerToken = stakingSharesPerToken;
  pool.rewardSharesPerToken = rewardSharesPerToken;

  // usage
  pool.usage = integerToDecimal(contract.ratio());

  // pool pricing
  updatePricing(pool, platform, tokens, stakingTokens, rewardTokens, timestamp);
  pool.updated = timestamp;
}

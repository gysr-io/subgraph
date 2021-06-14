// utilities for Geyser V1 updates and pricing

import { BigInt, log, store } from '@graphprotocol/graph-ts'
import { GeyserV1 as GeyserContractV1 } from '../../generated/templates/GeyserV1/GeyserV1'
import { Pool, Token, Platform, Transaction, Funding } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, INITIAL_SHARES_PER_TOKEN } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'


export function updateGeyserV1(
  pool: Pool,
  platform: Platform,
  contract: GeyserContractV1,
  stakingToken: Token,
  rewardToken: Token,
  timestamp: BigInt
): void {
  // tokens
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = timestamp;

  // token amounts
  pool.staked = integerToDecimal(contract.totalStaked(), stakingToken.decimals);
  pool.rewards = integerToDecimal(contract.totalLocked(), rewardToken.decimals).plus(
    integerToDecimal(contract.totalUnlocked(), rewardToken.decimals)
  );

  // share/amount rate
  let stakingSharesPerToken = contract.totalStaked().gt(ZERO_BIG_INT)
    ? contract.totalStakingShares().toBigDecimal().div(contract.totalStaked().toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;
  let rewardSharesPerToken = contract.totalLocked().gt(ZERO_BIG_INT)
    ? contract.totalLockedShares().toBigDecimal().div(contract.totalLocked().toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;

  pool.stakingSharesPerToken = stakingSharesPerToken;
  pool.rewardSharesPerToken = rewardSharesPerToken;

  // pool pricing
  updatePricing(pool, platform, stakingToken, rewardToken, timestamp);
  pool.updated = timestamp;
}
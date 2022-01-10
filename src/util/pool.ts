// utilities for Pool updates and pricing

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { Pool as PoolContract } from '../../generated/templates/Pool/Pool'
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/templates/Pool/ERC20StakingModule'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/Pool/ERC20BaseRewardModule'
import { Pool, Token, Platform, Transaction, Funding } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, INITIAL_SHARES_PER_TOKEN, ZERO_BIG_DECIMAL, ONE_E_18 } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'


export function updatePool(
  pool: Pool,
  platform: Platform,
  stakingToken: Token,
  rewardToken: Token,
  timestamp: BigInt
): void {
  let contract = PoolContract.bind(Address.fromString(pool.id));
  let rewardContract = ERC20BaseRewardModuleContract.bind(contract.rewardModule());

  // tokens
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = timestamp;

  // token amounts
  pool.staked = integerToDecimal(contract.stakingTotals()[0], stakingToken.decimals);
  pool.rewards = integerToDecimal(contract.rewardBalances()[0], rewardToken.decimals);

  // staking shares/amount rate
  if (pool.stakingModuleType == 'ERC20') {
    let stakingContract = ERC20StakingModuleContract.bind(contract.stakingModule());

    let stakingSharesPerToken = pool.staked.gt(ZERO_BIG_DECIMAL)
      ? integerToDecimal(stakingContract.totalShares(), stakingToken.decimals).div(pool.staked)
      : INITIAL_SHARES_PER_TOKEN;

    pool.stakingSharesPerToken = stakingSharesPerToken;

  } else {
    pool.stakingSharesPerToken = ONE_E_18;
  }

  // reward shares/amount rate
  let rewardSharesPerToken = pool.rewards.gt(ZERO_BIG_DECIMAL)
    ? integerToDecimal(
      rewardContract.lockedShares(Address.fromString(rewardToken.id)),
      rewardToken.decimals
    ).div(pool.rewards)
    : INITIAL_SHARES_PER_TOKEN;

  pool.rewardSharesPerToken = rewardSharesPerToken;

  // usage
  pool.usage = integerToDecimal(contract.usage());

  // pool pricing
  updatePricing(pool, platform, stakingToken, rewardToken, timestamp);
  pool.updated = timestamp;
}
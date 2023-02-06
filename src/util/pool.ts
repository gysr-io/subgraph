// utilities for Pool updates and pricing

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { Pool as PoolContract } from '../../generated/templates/Pool/Pool'
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/templates/Pool/ERC20StakingModule'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/Pool/ERC20BaseRewardModule'
import { ERC20LinearRewardModule as ERC20LinearRewardModuleContract } from '../../generated/templates/StakingModule/ERC20LinearRewardModule'
import { Pool, Token, Platform, Transaction, Funding } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, INITIAL_SHARES_PER_TOKEN, ZERO_BIG_DECIMAL, ONE_E_18 } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'
import { BASE_REWARD_MODULE_TYPES } from './constants'
import { updatePoolCompetitive } from '../modules/erc20competitive'
import { updatePoolLinear } from '../modules/erc20linear'


export function updatePool(
  pool: Pool,
  platform: Platform,
  stakingToken: Token,
  rewardToken: Token,
  timestamp: BigInt
): void {
  let contract = PoolContract.bind(Address.fromString(pool.id));

  // tokens
  stakingToken.price = getPrice(stakingToken, timestamp);
  stakingToken.updated = timestamp;
  rewardToken.price = getPrice(rewardToken, timestamp);
  rewardToken.updated = timestamp;

  // token amounts
  pool.staked = integerToDecimal(contract.stakingTotals()[0], stakingToken.decimals);
  pool.rewards = integerToDecimal(contract.rewardBalances()[0], rewardToken.decimals);

  // staking shares/amount rate
  if (pool.stakingModuleType == 'ERC20') {
    let stakingContract = ERC20StakingModuleContract.bind(Address.fromString(pool.stakingModule));

    let stakingSharesPerToken = pool.staked.gt(ZERO_BIG_DECIMAL)
      ? integerToDecimal(stakingContract.totalShares(), stakingToken.decimals).div(pool.staked)
      : INITIAL_SHARES_PER_TOKEN;

    pool.stakingSharesPerToken = stakingSharesPerToken;

  } else {
    pool.stakingSharesPerToken = ONE_E_18;
  }

  // module specific pool updates
  if (BASE_REWARD_MODULE_TYPES.includes(pool.rewardModuleType)) {
    updatePoolCompetitive(pool, rewardToken, timestamp);
  } else if (pool.rewardModuleType == 'ERC20Linear') {
    updatePoolLinear(pool, rewardToken, timestamp);
  }

  // usage
  pool.usage = integerToDecimal(contract.usage());

  // pool pricing
  updatePricing(pool, platform, stakingToken, rewardToken, timestamp);
  pool.updated = timestamp;
}
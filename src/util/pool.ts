// utilities for Pool updates and pricing

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts';
import { Pool as PoolContract } from '../../generated/templates/Pool/Pool';
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/templates/Pool/ERC20StakingModule';
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/Pool/ERC20BaseRewardModule';
import { ERC20LinearRewardModule as ERC20LinearRewardModuleContract } from '../../generated/templates/StakingModule/ERC20LinearRewardModule';
import { Pool, Token, Platform, PoolStakingToken, PoolRewardToken } from '../../generated/schema';
import { integerToDecimal } from '../util/common';
import {
  ZERO_BIG_INT,
  INITIAL_SHARES_PER_TOKEN,
  ZERO_BIG_DECIMAL,
  ONE_E_18
} from '../util/constants';
import { getPrice } from '../pricing/token';
import { updatePricing } from '../pricing/pool';
import { BASE_REWARD_MODULE_TYPES } from './constants';
import { updatePoolCompetitive } from '../modules/erc20competitive';
import { updatePoolLinear } from '../modules/erc20linear';

export function updatePool(
  pool: Pool,
  platform: Platform,
  tokens: Map<String, Token>,
  stakingTokens: Map<String, PoolStakingToken>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  let contract = PoolContract.bind(Address.fromString(pool.id));

  // tokens
  let stakingTotals = contract.stakingTotals();
  for (let i = 0; i < stakingTotals.length; i++) {
    let tkn = stakingTokens.keys()[i];
    tokens[tkn].price = getPrice(tokens[tkn], timestamp);
    tokens[tkn].updated = timestamp;
    stakingTokens[tkn].amount = integerToDecimal(stakingTotals[i], tokens[tkn].decimals);
    if (i == 0) pool.staked = stakingTokens[tkn].amount;
  }
  let rewardBalances = contract.rewardBalances();
  for (let i = 0; i < rewardBalances.length; i++) {
    let tkn = rewardTokens.keys()[i];
    tokens[tkn].price = getPrice(tokens[tkn], timestamp);
    tokens[tkn].updated = timestamp;
    rewardTokens[tkn].amount = integerToDecimal(rewardBalances[i], tokens[tkn].decimals);
    if (i == 0) pool.rewards = rewardTokens[tkn].amount;
  }
  // TODO also included earned claimable rewards in TVL

  // staking shares/amount rate
  if (pool.stakingModuleType == 'ERC20') {
    let stakingContract = ERC20StakingModuleContract.bind(Address.fromString(pool.stakingModule));

    let token = tokens.values()[0];

    let stakingSharesPerToken = pool.staked.gt(ZERO_BIG_DECIMAL)
      ? integerToDecimal(stakingContract.totalShares(), token.decimals).div(pool.staked)
      : INITIAL_SHARES_PER_TOKEN;

    pool.stakingSharesPerToken = stakingSharesPerToken;
    stakingTokens[token.id].sharesPerToken = stakingSharesPerToken;
  } else if (pool.stakingModuleType == 'ERC20Bond') {
    // TODO
  } else if (
    pool.rewardModuleType == 'ERC20CompetitiveV2' ||
    pool.rewardModuleType == 'ERC20FriendlyV2'
  ) {
    // erc721 legacy
    pool.stakingSharesPerToken = ONE_E_18;
  } else {
    // assignment, erc721
    pool.stakingSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  }

  // module specific pool updates
  if (BASE_REWARD_MODULE_TYPES.includes(pool.rewardModuleType)) {
    updatePoolCompetitive(pool, tokens, rewardTokens, timestamp);
  } else if (pool.rewardModuleType == 'ERC20Linear') {
    updatePoolLinear(pool, tokens, rewardTokens, timestamp);
  }

  // usage
  pool.usage = integerToDecimal(contract.usage());

  // pool pricing
  updatePricing(pool, platform, tokens, stakingTokens, rewardTokens, timestamp);
  pool.updated = timestamp;
}

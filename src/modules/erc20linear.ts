// handler methods for the erc20 linear reward module

import { Address, BigInt, log } from '@graphprotocol/graph-ts';
import { ERC20LinearRewardModule as ERC20LinearRewardModuleContract } from '../../generated/templates/StakingModule/ERC20LinearRewardModule';
import {
  Staked1 as Staked,
  Unstaked1 as Unstaked,
  Claimed1 as Claimed
} from '../../generated/templates/StakingModule/Events';
import { RewardsFunded } from '../../generated/templates/RewardModule/Events';
import { Pool, Token, Position, PoolRewardToken } from '../../generated/schema';
import { integerToDecimal } from '../util/common';
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  ONE_E_18,
  INITIAL_SHARES_PER_TOKEN
} from '../util/constants';

export function handleRewardsFundedLinear(
  event: RewardsFunded,
  pool: Pool,
  tokens: Map<String, Token>
): void {
  let contract = ERC20LinearRewardModuleContract.bind(event.address);

  // update timeframe for pool
  if (pool.start.equals(ZERO_BIG_INT)) pool.start = event.params.timestamp;

  // TODO do we still want to create an object here?
}

export function handleStakedLinear(event: Staked, pool: Pool, position: Position): void {
  let contract = ERC20LinearRewardModuleContract.bind(event.address);
  // TODO anything useful here?
}

export function updatePoolLinear(
  pool: Pool,
  tokens: Map<String, Token>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  let tkn = rewardTokens.keys()[0];
  let contract = ERC20LinearRewardModuleContract.bind(Address.fromString(pool.rewardModule));

  // update runway for pool
  let stakingShares = contract.stakingShares();
  let runway = ZERO_BIG_INT;

  if (stakingShares.gt(ZERO_BIG_INT)) {
    let budget = contract.rewardShares().minus(contract.earned());
    runway = budget.div(stakingShares.times(contract.rate()).div(BigInt.fromI32(10).pow(18)));
    pool.end = timestamp.plus(runway);
  } else {
    pool.end = ZERO_BIG_INT;
  }

  // update shares per token
  let rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  if (pool.rewards.gt(ZERO_BIG_DECIMAL)) {
    rewardSharesPerToken = integerToDecimal(
      contract.rewardShares().minus(contract.earned()),
      tokens[tkn].decimals
    ).div(pool.rewards);
  }
  rewardTokens[tkn].sharesPerToken = rewardSharesPerToken;
  pool.rewardSharesPerToken = rewardSharesPerToken;
}

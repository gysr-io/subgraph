// pricing for pool information on apr, tvl, and more

import { Address, BigInt, BigDecimal, log, store } from '@graphprotocol/graph-ts';
import {
  Pool,
  Platform,
  Token,
  Funding,
  PoolStakingToken,
  PoolRewardToken
} from '../../generated/schema';
import { integerToDecimal } from '../util/common';
import { INITIAL_SHARES_PER_TOKEN, ZERO_BIG_DECIMAL, ZERO_BIG_INT } from '../util/constants';

export function updatePricing(
  pool: Pool,
  platform: Platform,
  tokens: Map<String, Token>,
  stakingTokens: Map<String, PoolStakingToken>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  // usd amounts
  platform.tvl = platform.tvl.minus(pool.tvl);
  platform.staked = platform.staked.minus(pool.stakedUSD);
  platform.rewards = platform.rewards.minus(pool.rewardsUSD);

  pool.stakedUSD = ZERO_BIG_DECIMAL;
  pool.rewardsUSD = ZERO_BIG_DECIMAL;
  for (let i = 0; i < stakingTokens.keys().length; i++) {
    let tkn = stakingTokens.keys()[i];
    pool.stakedUSD = pool.stakedUSD.plus(stakingTokens[tkn].amount.times(tokens[tkn].price));
  }
  for (let i = 0; i < rewardTokens.keys().length; i++) {
    let tkn = rewardTokens.keys()[i];
    pool.rewardsUSD = pool.rewardsUSD.plus(rewardTokens[tkn].amount.times(tokens[tkn].price));
    rewardTokens[tkn].sharesPerSecond = ZERO_BIG_DECIMAL;
  }
  // pool.stakedUSD = pool.staked.times(stakingToken.price);
  // pool.rewardsUSD = pool.rewards.times(rewardToken.price);
  pool.tvl = pool.stakedUSD.plus(pool.rewardsUSD);

  platform.tvl = platform.tvl.plus(pool.tvl);
  platform.staked = platform.staked.plus(pool.stakedUSD);
  platform.rewards = platform.rewards.plus(pool.rewardsUSD);

  // fundings
  let fundings = pool.fundings;
  let active = false;
  let next = BigInt.fromI32(10).times(timestamp);
  let rate = ZERO_BIG_DECIMAL;
  for (let i = 0; i < fundings.length; i++) {
    let funding = Funding.load(fundings[i])!;
    // active
    if (funding.start.le(timestamp) && funding.end.gt(timestamp) && !active) {
      active = true;
      rate = ZERO_BIG_DECIMAL;
    }
    // boiling
    else if (funding.start.gt(timestamp) && funding.start.lt(next) && !active) {
      next = funding.start;
      rate = ZERO_BIG_DECIMAL;
    }

    // rate
    if (
      (active && funding.start.lt(timestamp) && funding.end.gt(timestamp)) ||
      (!active && funding.start == next)
    ) {
      // token shares per second
      let tkn = funding.token;
      rewardTokens[tkn].sharesPerSecond = rewardTokens[tkn].sharesPerSecond.plus(
        funding.sharesPerSecond
      );

      // total usd per second
      rate = rate.plus(
        funding.sharesPerSecond.times(tokens[tkn].price).div(rewardTokens[tkn].sharesPerToken)
      );
    }
  }
  pool.sharesPerSecond = rate;

  // apr
  if (rate.gt(ZERO_BIG_DECIMAL) && pool.stakedUSD.gt(ZERO_BIG_DECIMAL)) {
    let yearly = BigDecimal.fromString('31536000').times(rate);
    pool.apr = yearly.div(pool.stakedUSD).times(BigDecimal.fromString('100'));
  } else {
    pool.apr = ZERO_BIG_DECIMAL;
  }

  // state
  if (active) {
    pool.state = 'Active';
  } else if (pool.rewardModuleType == 'ERC20Linear' && pool.end.gt(timestamp)) {
    // temp case handling
    pool.state = 'Active';
  } else if (rate.gt(ZERO_BIG_DECIMAL)) {
    pool.state = 'Boiling';
  } else if (pool.funded.gt(ZERO_BIG_DECIMAL)) {
    pool.state = 'Stale';
  }
}

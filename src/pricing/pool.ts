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
    rewardTokens[tkn].state = rewardTokens[tkn].funded.gt(ZERO_BIG_DECIMAL) ? 'Stale' : 'Unfunded'; // init options
  }
  pool.tvl = pool.stakedUSD.plus(pool.rewardsUSD);

  platform.tvl = platform.tvl.plus(pool.tvl);
  platform.staked = platform.staked.plus(pool.stakedUSD);
  platform.rewards = platform.rewards.plus(pool.rewardsUSD);

  // fundings
  let fundings = pool.fundings;
  pool.state = fundings.length > 0 ? 'Stale' : 'Unfunded';
  let next = BigInt.fromI32(10).times(timestamp);
  let nextTokens = new Map<String, BigInt>();
  let rate = ZERO_BIG_DECIMAL;
  for (let i = 0; i < fundings.length; i++) {
    let funding = Funding.load(fundings[i])!;
    let tkn = funding.token;

    // active
    if (funding.start.le(timestamp) && funding.end.gt(timestamp) && pool.state != 'Active') {
      if (pool.state != 'Active') {
        pool.state = 'Active';
        rate = ZERO_BIG_DECIMAL;
      }
      if (rewardTokens[tkn].state != 'Active') {
        rewardTokens[tkn].state = 'Active';
        rewardTokens[tkn].sharesPerSecond = ZERO_BIG_DECIMAL;
      }
    }
    // boiling
    else if (funding.start.gt(timestamp)) {
      if (funding.start.lt(next) && pool.state != 'Active') {
        pool.state = 'Boiling';
        rate = ZERO_BIG_DECIMAL;
        next = funding.start;
      }
      if (
        (!nextTokens.has(tkn) || funding.start.lt(nextTokens[tkn])) &&
        rewardTokens[tkn].state != 'Active'
      ) {
        rewardTokens[tkn].state = 'Boiling';
        rewardTokens[tkn].sharesPerSecond = ZERO_BIG_DECIMAL;
        nextTokens.set(tkn, funding.start);
      }
    }

    // rate
    if (
      (pool.state == 'Active' && funding.start.lt(timestamp) && funding.end.gt(timestamp)) ||
      (pool.state == 'Boiling' && funding.start == next)
    ) {
      // total usd per second
      rate = rate.plus(
        funding.sharesPerSecond.times(tokens[tkn].price).div(rewardTokens[tkn].sharesPerToken)
      );
    }
    if (
      (rewardTokens[tkn].state == 'Active' &&
        funding.start.lt(timestamp) &&
        funding.end.gt(timestamp)) ||
      (rewardTokens[tkn].state == 'Boiling' && funding.start == nextTokens[tkn])
    ) {
      // token shares per second
      rewardTokens[tkn].sharesPerSecond = rewardTokens[tkn].sharesPerSecond.plus(
        funding.sharesPerSecond
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

  // pool state -- temp case handling
  if (pool.rewardModuleType == 'ERC20Linear' && pool.end.gt(timestamp)) {
    pool.state = 'Active';
    rewardTokens.values()[0].state = 'Active';
  }
}

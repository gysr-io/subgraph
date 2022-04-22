// pricing for pool information on apr, tvl, and more

import { Address, BigInt, BigDecimal, log, store } from '@graphprotocol/graph-ts'
import { Pool, Platform, Token, Funding } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { INITIAL_SHARES_PER_TOKEN, ZERO_BIG_DECIMAL, ZERO_BIG_INT } from '../util/constants';


export function updatePricing(
  pool: Pool,
  platform: Platform,
  stakingToken: Token,
  rewardToken: Token,
  timestamp: BigInt
): void {

  // usd amounts
  pool.stakedUSD = pool.staked.times(stakingToken.price);
  pool.rewardsUSD = pool.rewards.times(rewardToken.price);
  let previousPoolValue = pool.tvl;
  pool.tvl = pool.stakedUSD.plus(pool.rewardsUSD);
  platform.tvl = platform.tvl.plus(pool.stakedUSD).plus(pool.rewardsUSD).minus(previousPoolValue);

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
    if ((active && funding.start.lt(timestamp) && funding.end.gt(timestamp))
      || (!active && funding.start == next)) {
      // shares per second
      rate = rate.plus(funding.sharesPerSecond);
    }
  }
  pool.sharesPerSecond = rate;

  // apr
  if (rate.gt(ZERO_BIG_DECIMAL)
    && rewardToken.price.gt(ZERO_BIG_DECIMAL)
    && pool.stakedUSD.gt(ZERO_BIG_DECIMAL)
  ) {
    let yearly = BigDecimal.fromString('31536000').times(
      rewardToken.price.times(
        rate.div(pool.rewardSharesPerToken)
      )
    );
    pool.apr = yearly.div(pool.stakedUSD).times(BigDecimal.fromString('100'));

  } else {
    pool.apr = ZERO_BIG_DECIMAL;
  }

  // state
  if (active) {
    pool.state = 'Active';
  } else if (rate.gt(ZERO_BIG_DECIMAL)) {
    pool.state = 'Boiling';
  } else if (pool.funded.gt(ZERO_BIG_DECIMAL)) {
    pool.state = 'Stale';
  }
}

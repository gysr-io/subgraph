// pricing for geyser information on apy, tvl, and more

import { Address, BigInt, BigDecimal, log, store } from '@graphprotocol/graph-ts'
import { Geyser as GeyserContract } from '../../generated/templates/Geyser/Geyser'
import { Geyser, Token } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { INITIAL_SHARES_PER_TOKEN, ZERO_BIG_DECIMAL, ZERO_BIG_INT } from '../util/constants';

export function updatePricing(
  geyser: Geyser,
  contract: GeyserContract,
  stakingToken: Token,
  rewardToken: Token,
  timestamp: BigInt
): void {

  // token amounts
  geyser.staked = integerToDecimal(contract.totalStaked(), stakingToken.decimals);
  geyser.rewards = integerToDecimal(contract.totalLocked(), rewardToken.decimals).plus(
    integerToDecimal(contract.totalUnlocked(), rewardToken.decimals)
  );

  // usd amounts
  geyser.stakedUSD = geyser.staked.times(stakingToken.price);
  geyser.rewardsUSD = geyser.rewards.times(rewardToken.price);
  geyser.tvl = geyser.stakedUSD.plus(geyser.rewardsUSD);

  // fundings
  let count = contract.fundingCount().toI32();
  let active = false;
  let next = BigInt.fromI32(10).times(timestamp);
  let rate = ZERO_BIG_DECIMAL;
  for (let i = 0; i < count; i++) {
    let funding = contract.fundings(BigInt.fromI32(i));
    // active
    if (funding.value4.le(timestamp) && funding.value5.gt(timestamp) && !active) {
      active = true;
      rate = ZERO_BIG_DECIMAL;
    }
    // boiling
    else if (funding.value4.gt(timestamp) && funding.value4.lt(next) && !active) {
      next = funding.value4;
      rate = ZERO_BIG_DECIMAL;
    }

    // rate
    if ((active && funding.value4.lt(timestamp) && funding.value5.gt(timestamp))
      || (!active && funding.value4 == next)) {
      // shares per second
      rate = rate.plus(
        integerToDecimal(funding.value1, rewardToken.decimals).div(
          funding.value6.toBigDecimal()
        )
      );
    }
  }

  let stakingSharesPerToken = contract.totalStaked().gt(ZERO_BIG_INT)
    ? contract.totalStakingShares().toBigDecimal().div(contract.totalStaked().toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;
  let rewardSharesPerToken = contract.totalLocked().gt(ZERO_BIG_INT)
    ? contract.totalLockedShares().toBigDecimal().div(contract.totalLocked().toBigDecimal())
    : INITIAL_SHARES_PER_TOKEN;

  geyser.sharesPerSecond = rate;
  geyser.stakingSharesPerToken = stakingSharesPerToken;
  geyser.rewardSharesPerToken = rewardSharesPerToken;


  // apy
  if (rate.gt(ZERO_BIG_DECIMAL)
    && rewardToken.price.gt(ZERO_BIG_DECIMAL)
    && geyser.stakedUSD.gt(ZERO_BIG_DECIMAL)
  ) {
    let yearly = BigDecimal.fromString('31536000').times(
      rewardToken.price.times(
        rate.div(rewardSharesPerToken)
      )
    );
    geyser.apy = yearly.div(geyser.stakedUSD).times(BigDecimal.fromString('100'));

  } else {
    geyser.apy = ZERO_BIG_DECIMAL;
  }

  // state
  if (active) {
    geyser.state = 'Active';
  } else if (rate.gt(ZERO_BIG_DECIMAL)) {
    geyser.state = 'Boiling';
  } else if (contract.totalRewards().gt(ZERO_BIG_INT)) {
    geyser.state = 'Stale';
  }
}

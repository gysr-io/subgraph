// pricing for geyser information on apy, tvl, and more

import { Geyser as GeyserContract } from '../../generated/templates/Geyser/Geyser'
import { Geyser, Token } from '../../generated/schema'
import { integerToDecimal } from '../util/common'


export function updatePricing(
  geyser: Geyser,
  contract: GeyserContract,
  stakingToken: Token,
  rewardToken: Token
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
}

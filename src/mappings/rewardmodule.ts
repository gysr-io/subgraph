// ERC20BaseRewardModule event handling and mapping

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { RewardsFunded } from '../../generated/templates/ERC20BaseRewardModule/ERC20BaseRewardModule'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/ERC20BaseRewardModule/ERC20BaseRewardModule'
import { Pool, Token, Platform, Funding } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'


export function handleRewardsFunded(event: RewardsFunded): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);

  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS)!;

  let amount = integerToDecimal(event.params.amount, rewardToken.decimals)
  pool.rewards = pool.rewards.plus(amount);
  pool.funded = pool.funded.plus(amount);

  // update timeframe for pool
  if (event.params.timestamp.lt(pool.start) || pool.start.equals(ZERO_BIG_INT)) {
    pool.start = event.params.timestamp;
  }
  let addr = Address.fromString(rewardToken.id);
  let idx = contract.fundingCount(addr).minus(BigInt.fromI32(1));
  let fundingStruct = contract.fundings(addr, idx);
  let duration = fundingStruct.value5;

  let end = event.params.timestamp.plus(duration);
  if (end.gt(pool.end) || pool.end.equals(ZERO_BIG_INT)) {
    pool.end = end;
  }

  // create funding
  let fundingId = pool.id + '_' + event.block.timestamp.toString();
  let funding = new Funding(fundingId);
  funding.pool = pool.id;
  funding.token = rewardToken.id;
  funding.createdTimestamp = event.block.timestamp;
  funding.start = event.params.timestamp;
  funding.end = end;
  let formattedAmount = integerToDecimal(event.params.amount, rewardToken.decimals);
  let shares = formattedAmount.times(pool.rewardSharesPerToken);
  funding.originalAmount = formattedAmount;
  funding.shares = shares;
  funding.sharesPerSecond = shares.div(duration.toBigDecimal());

  pool.fundings = pool.fundings.concat([funding.id])

  // update pricing info
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = event.block.timestamp;

  // TODO
  //updatePricing(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp);
  pool.updated = event.block.timestamp;

  // update platform
  if (!platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }

  // store
  funding.save();
  pool.save();
  stakingToken.save();
  rewardToken.save();
  platform.save();

  log.info('rewards funded {} {} {} {}', [pool.id, rewardToken.symbol, funding.originalAmount.toString(), funding.shares.toString()]);
}

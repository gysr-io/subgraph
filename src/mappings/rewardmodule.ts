// ERC20 base reward module event handling and mapping

import { Address, BigInt, log, store, dataSource } from '@graphprotocol/graph-ts'
import {
  RewardsFunded,
  GysrSpent,
  RewardsDistributed
} from '../../generated/templates/ERC20BaseRewardModule/ERC20BaseRewardModule'
import {
  ERC20BaseRewardModule as ERC20BaseRewardModuleContract
} from '../../generated/templates/ERC20BaseRewardModule/ERC20BaseRewardModule'
import { Pool, Token, Platform, Funding, Transaction } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN, KOVAN_GYSR_TOKEN } from '../util/constants'
import { getPrice, createNewToken } from '../pricing/token'
import { updatePool } from '../util/pool'
import { updatePoolDayData } from '../util/common'


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
  funding.save(); // save before pricing

  pool.fundings = pool.fundings.concat([funding.id])

  // update pricing info
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = event.block.timestamp;

  // update pool pricing
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);

  // update platform
  if (!platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }

  // store
  pool.save();
  stakingToken.save();
  rewardToken.save();
  platform.save();

  log.info('rewards funded {} {} {} {}', [pool.id, rewardToken.symbol, funding.originalAmount.toString(), funding.shares.toString()]);
}


export function handleGysrSpent(event: GysrSpent): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS);

  // update gysr spent on unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  let amount = integerToDecimal(event.params.amount, BigInt.fromI32(18));
  transaction.gysrSpent = amount;

  // update total GYSR spent
  platform.gysrSpent = platform.gysrSpent.plus(amount);
  pool.gysrSpent = pool.gysrSpent.plus(amount);

  // pricing for volume
  let gysrAddress = dataSource.network() == 'mainnet' ? GYSR_TOKEN : KOVAN_GYSR_TOKEN;
  let gysr = Token.load(gysrAddress);
  if (gysr === null) {
    gysr = createNewToken(Address.fromString(gysrAddress));
  }
  gysr.price = getPrice(gysr!);
  gysr.updated = event.block.timestamp;

  let dollarAmount = amount.times(gysr.price);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  pool.save();
  //transaction.save();
  platform.save();
  poolDayData.save();
  gysr.save();
}


export function handleRewardsDistributed(event: RewardsDistributed): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let token = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS);

  let amount = integerToDecimal(event.params.amount, token.decimals);
  pool.rewards = pool.rewards.minus(amount);
  pool.distributed = pool.distributed.plus(amount);

  // pricing for volume
  let dollarAmount = amount.times(getPrice(token));
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  // update unstake transaction earnings
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.earnings = amount;

  pool.save();
  //transaction.save();
  platform.save();
  poolDayData.save();
}

// Pool event handling and mapping

import { BigInt, log, store } from '@graphprotocol/graph-ts'
import {
  GeyserV1 as GeyserContractV1,
  Staked,
  Unstaked,
  RewardsFunded,
  RewardsDistributed,
  RewardsUnlocked,
  RewardsExpired,
  GysrSpent,
  OwnershipTransferred
} from '../../generated/templates/GeyserV1/GeyserV1'
import { Pool, Token, User, Position, Stake, Platform, Transaction, Funding } from '../../generated/schema'
import { integerToDecimal, createNewUser, createNewPlatform, updatePoolDayData } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'


export function handleStaked(event: Staked): void {
  // load pool and token
  let pool = Pool.load(event.address.toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS)!;

  // load or create user
  let user = User.load(event.params.user.toHexString());

  if (user === null) {
    user = createNewUser(event.params.user);
    platform.users = platform.users.plus(BigInt.fromI32(1));
  }

  // load or create position
  let positionId = pool.id + '_' + user.id;

  let position = Position.load(positionId);

  if (position === null) {
    position = new Position(positionId);
    position.user = user.id;
    position.pool = pool.id;
    position.shares = ZERO_BIG_DECIMAL;
    position.stakes = [];

    pool.users = pool.users.plus(BigInt.fromI32(1));
  }

  // create new stake
  let stakeId = positionId + '_' + event.block.timestamp.toString();

  let stake = new Stake(stakeId);
  stake.position = position.id;
  stake.user = user.id;
  stake.pool = pool.id;

  // get share info from contract
  let contract = GeyserContractV1.bind(event.address);
  let idx = contract.stakeCount(event.params.user).minus(BigInt.fromI32(1));
  let stakeStruct = contract.userStakes(event.params.user, idx);
  let shares = integerToDecimal(stakeStruct.value0, stakingToken.decimals);

  // update info
  stake.shares = shares;
  stake.timestamp = event.block.timestamp;

  position.shares = position.shares.plus(shares);
  position.stakes = position.stakes.concat([stake.id]);

  user.operations = user.operations.plus(BigInt.fromI32(1));
  pool.operations = pool.operations.plus(BigInt.fromI32(1));
  platform.operations = platform.operations.plus(BigInt.fromI32(1));

  // create new stake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.type = 'Stake';
  transaction.timestamp = event.block.timestamp;
  transaction.pool = pool.id;
  transaction.user = user.id;
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);

  // update pricing info
  stakingToken.price = getPrice(stakingToken);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken);
  rewardToken.updated = event.block.timestamp;

  updatePricing(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  pool.updated = event.block.timestamp;

  // store
  stake.save();
  position.save();
  user.save();
  pool.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
  platform.save();
  poolDayData.save();
}


export function handleUnstaked(event: Unstaked): void {
  // load pool and token
  let pool = Pool.load(event.address.toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS)!;

  // load user
  let user = User.load(event.params.user.toHexString());

  // load position
  let positionId = pool.id + '_' + user.id;
  let position = Position.load(positionId);

  // get share info from contract
  let contract = GeyserContractV1.bind(event.address);
  let count = contract.stakeCount(event.params.user).toI32();

  // format unstake amount
  let unstakeAmount = integerToDecimal(event.params.amount, stakingToken.decimals);

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete stake
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i]);

    // get data to update object from contract
    let stakeStruct = contract.userStakes(event.params.user, BigInt.fromI32(i));
    if (stakeStruct.value1 != stake.timestamp) {
      log.error(
        'Stake timestamps not equal: {} != {}',
        [stake.timestamp.toString(), stakeStruct.value1.toString()]
      )
    }
    let shares = integerToDecimal(stakeStruct.value0, stakingToken.decimals);
    stake.shares = shares;
    stake.save();
    break;
  }

  // update position info
  let userStruct = contract.userTotals(event.params.user);
  let shares = integerToDecimal(userStruct.value0, stakingToken.decimals);
  position.shares = shares;
  position.stakes = stakes;
  if (position.shares) {
    position.save();
  } else {
    store.remove('Position', positionId);
    pool.users = pool.users.minus(BigInt.fromI32(1));
  }

  // update general info
  user.operations = user.operations.plus(BigInt.fromI32(1));
  pool.operations = pool.operations.plus(BigInt.fromI32(1));
  platform.operations = platform.operations.plus(BigInt.fromI32(1));

  // create new unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.type = 'Unstake';
  transaction.timestamp = event.block.timestamp;
  transaction.pool = pool.id;
  transaction.user = user.id;
  transaction.amount = unstakeAmount;
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pricing info
  stakingToken.price = getPrice(stakingToken);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken);
  rewardToken.updated = event.block.timestamp;

  updatePricing(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp);
  pool.updated = event.block.timestamp;

  // update volume
  let dollarAmount = unstakeAmount.times(stakingToken.price);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  // store
  user.save();
  pool.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
  platform.save();
  poolDayData.save();
}


export function handleRewardsFunded(event: RewardsFunded): void {
  let pool = Pool.load(event.address.toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS)!;

  let contract = GeyserContractV1.bind(event.address);

  let amount = integerToDecimal(event.params.amount, rewardToken.decimals)
  pool.rewards = pool.rewards.plus(amount);
  pool.funded = pool.funded.plus(amount);

  // update pricing info
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = event.block.timestamp;

  updatePricing(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp);
  pool.updated = event.block.timestamp;

  // update timeframe for pool
  if (event.params.start.lt(pool.start) || pool.start.equals(ZERO_BIG_INT)) {
    pool.start = event.params.start;
  }
  let end = event.params.start.plus(event.params.duration);
  if (end.gt(pool.end) || pool.end.equals(ZERO_BIG_INT)) {
    pool.end = end;
  }

  // create funding
  let fundingId = pool.id + '_' + event.block.timestamp.toString();
  let funding = new Funding(fundingId);
  funding.pool = pool.id;
  funding.token = rewardToken.id;
  funding.createdTimestamp = event.block.timestamp;
  funding.start = event.params.start;
  funding.end = event.params.start.plus(event.params.duration);
  let formattedAmount = integerToDecimal(event.params.amount, rewardToken.decimals);
  let shares = formattedAmount.times(pool.rewardSharesPerToken);
  funding.originalAmount = formattedAmount;
  funding.shares = shares;
  funding.sharesPerSecond = shares.div(event.params.duration.toBigDecimal());

  pool.fundings = pool.fundings.concat([funding.id])

  // TODO: map of reward rates over time

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
}


export function handleRewardsDistributed(event: RewardsDistributed): void {
  let pool = Pool.load(event.address.toHexString())!;
  let token = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS);

  let amount = integerToDecimal(event.params.amount, token.decimals);
  pool.rewards = pool.rewards.minus(amount);
  pool.distributed = pool.distributed.plus(amount);

  let dollarAmount = amount.times(getPrice(token));
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  // update unstake transaction earnings
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.earnings = amount;

  pool.save();
  transaction.save();
  platform.save();
  poolDayData.save();
}


export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  let pool = Pool.load(event.address.toHexString());
  let newOwner = User.load(event.params.newOwner.toHexString());
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    platform = createNewPlatform();
  }

  if (newOwner == null) {
    newOwner = createNewUser(event.params.newOwner);
    platform.users = platform.users.plus(BigInt.fromI32(1));
    newOwner.save()
  }

  pool.owner = newOwner.id;

  pool.save();
  platform.save();
}


export function handleRewardsUnlocked(event: RewardsUnlocked): void {
  // todo
}


export function handleRewardsExpired(event: RewardsExpired): void {
  let pool = Pool.load(event.address.toHexString());
  let rewardToken = Token.load(pool.rewardToken);
  let amount = integerToDecimal(event.params.amount, rewardToken.decimals);

  for (let i = 0; i < pool.fundings.length; i++) {
    let fundingId = (pool.fundings as string[])[i];
    let funding = Funding.load(fundingId);

    // remove expired funding
    if (funding.start.equals(event.params.start)
    && funding.end.equals(funding.start.plus(event.params.duration))
    && funding.originalAmount.equals(amount)) {
      store.remove('Funding', fundingId);
      break;
    }
  }
}


export function handleGysrSpent(event: GysrSpent): void {
  let amount = integerToDecimal(event.params.amount, BigInt.fromI32(18));
  // update gysr spent on unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.gysrSpent = amount;

  let pool = Pool.load(event.address.toHexString())!;
  pool.gysrSpent = pool.gysrSpent.plus(amount);

  // update platform total GYSR spent
  let platform = Platform.load(ZERO_ADDRESS);
  let gysr = Token.load(GYSR_TOKEN)!;
  platform.gysrSpent = platform.gysrSpent.plus(amount);

  let dollarAmount = amount.times(getPrice(gysr));
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  transaction.save();
  pool.save();
  platform.save();
  poolDayData.save();
}

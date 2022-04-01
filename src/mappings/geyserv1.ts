// Geyser V1 event handling and mapping

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import {
  GeyserV1 as GeyserContractV1,
  Staked,
  Unstaked,
  RewardsFunded,
  RewardsDistributed,
  RewardsExpired,
  GysrSpent,
  OwnershipTransferred
} from '../../generated/templates/GeyserV1/GeyserV1'
import { Pool, Token, User, Position, Stake, Platform, Transaction, Funding } from '../../generated/schema'
import { integerToDecimal, createNewUser, createNewPlatform, updatePoolDayData, updatePlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN, PRICING_MIN_TVL } from '../util/constants'
import { getPrice, createNewToken } from '../pricing/token'
import { updateGeyserV1 } from '../util/geyserv1'


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
  let stakeId = positionId + '_' + event.transaction.hash.toHexString();

  let stake = new Stake(stakeId);
  stake.position = position.id;
  stake.user = user.id;
  stake.pool = pool.id;

  // update pool data
  let contract = GeyserContractV1.bind(event.address);
  updateGeyserV1(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp, event.block.number);

  // amount and shares
  let amount = integerToDecimal(event.params.amount, stakingToken.decimals);
  let shares = amount.times(pool.stakingSharesPerToken);

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
  transaction.amount = amount;
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // daily
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  // update volume
  let dollarAmount = amount.times(stakingToken.price);
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  // update platform pricing
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, event.block.number, pool);

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
  let amount = integerToDecimal(event.params.amount, stakingToken.decimals);

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
  transaction.amount = amount;
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pool data
  updateGeyserV1(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp, event.block.number);

  // update position info
  let shares = amount.times(pool.stakingSharesPerToken);
  position.shares = position.shares.minus(shares);
  position.stakes = stakes;
  if (position.shares.gt(ZERO_BIG_DECIMAL)) {
    position.save();
  } else {
    store.remove('Position', positionId);
    pool.users = pool.users.minus(BigInt.fromI32(1));
  }

  // daily
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  // update platform pricing
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, event.block.number, pool);

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
  pool.funded = pool.funded.plus(amount);

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
  funding.cleaned = false;
  funding.save();  // save before pricing

  pool.fundings = pool.fundings.concat([funding.id])

  // update pricing info
  updateGeyserV1(pool, platform, contract, stakingToken, rewardToken, event.block.timestamp, event.block.number);

  // update platform
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, event.block.number, pool);

  // store
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
  pool.distributed = pool.distributed.plus(amount);

  let dollarAmount = amount.times(getPrice(token, event.block.number)); //  TODO - can we just use the stored price?
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


export function handleRewardsExpired(event: RewardsExpired): void {
  let pool = Pool.load(event.address.toHexString());
  let rewardToken = Token.load(pool.rewardToken);
  let amount = integerToDecimal(event.params.amount, rewardToken.decimals);

  let fundings = pool.fundings;
  for (let i = 0; i < fundings.length; i++) {
    let funding = Funding.load(fundings[i]);

    // mark expired funding as cleaned
    if (funding.start.equals(event.params.start)
      && funding.end.equals(funding.start.plus(event.params.duration))
      && funding.originalAmount.equals(amount)) {
      funding.cleaned = true;
      funding.save();
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
  platform.gysrSpent = platform.gysrSpent.plus(amount);

  let gysr = Token.load(GYSR_TOKEN);
  if (gysr === null) {
    gysr = createNewToken(Address.fromString(GYSR_TOKEN));
  }
  gysr.price = getPrice(gysr!, event.block.number);
  gysr.updated = event.block.timestamp;

  let dollarAmount = amount.times(gysr.price);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  transaction.save();
  pool.save();
  platform.save();
  poolDayData.save();
  gysr.save();
}

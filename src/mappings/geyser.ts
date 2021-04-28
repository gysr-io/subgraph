// Geyser event handling and mapping

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import {
  Geyser as GeyserContract,
  Staked,
  Unstaked,
  RewardsFunded,
  RewardsDistributed,
  RewardsUnlocked,
  RewardsExpired,
  GysrSpent,
  OwnershipTransferred
} from '../../generated/templates/Geyser/Geyser'
import { Geyser, Token, User, Position, Stake, Platform, Transaction } from '../../generated/schema'
import { integerToDecimal, createNewUser } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/geyser'


export function handleStaked(event: Staked): void {
  // load geyser and token
  let geyser = Geyser.load(event.address.toHexString())!;
  let stakingToken = Token.load(geyser.stakingToken)!;
  let rewardToken = Token.load(geyser.rewardToken)!;

  // load or create user
  let user = User.load(event.params.user.toHexString());

  if (user === null) {
    user = createNewUser(event.params.user);
  }

  // load or create position
  let positionId = geyser.id + '_' + user.id;

  let position = Position.load(positionId);

  if (position === null) {
    position = new Position(positionId);
    position.user = user.id;
    position.geyser = geyser.id;
    position.shares = ZERO_BIG_DECIMAL;
    position.stakes = [];

    geyser.users = geyser.users.plus(BigInt.fromI32(1));
  }

  // create new stake
  let stakeId = positionId + '_' + event.block.timestamp.toString();

  let stake = new Stake(stakeId);
  stake.position = position.id;
  stake.user = user.id;
  stake.geyser = geyser.id;

  // get share info from contract
  let contract = GeyserContract.bind(event.address);
  let idx = contract.stakeCount(event.params.user).minus(BigInt.fromI32(1));
  let stakeStruct = contract.userStakes(event.params.user, idx);
  let shares = integerToDecimal(stakeStruct.value0, stakingToken.decimals);

  // update info
  stake.shares = shares;
  stake.timestamp = event.block.timestamp;

  position.shares = position.shares.plus(shares);
  position.stakes = position.stakes.concat([stake.id]);

  user.operations = user.operations.plus(BigInt.fromI32(1));
  geyser.operations = geyser.operations.plus(BigInt.fromI32(1));

  // create new stake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.type = 'Stake';
  transaction.timestamp = event.block.timestamp;
  transaction.geyser = geyser.id;
  transaction.user = user.id;
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);

  // update pricing info
  stakingToken.price = getPrice(stakingToken);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken);
  rewardToken.updated = event.block.timestamp;

  updatePricing(geyser, contract, stakingToken, rewardToken, event.block.timestamp);
  geyser.updated = event.block.timestamp;

  // store
  stake.save();
  position.save();
  user.save();
  geyser.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
}


export function handleUnstaked(event: Unstaked): void {
  // load geyser and token
  let geyser = Geyser.load(event.address.toHexString())!;
  let stakingToken = Token.load(geyser.stakingToken)!;
  let rewardToken = Token.load(geyser.rewardToken)!;

  // load user
  let user = User.load(event.params.user.toHexString());

  // load position
  let positionId = geyser.id + '_' + user.id;
  let position = Position.load(positionId);

  // get share info from contract
  let contract = GeyserContract.bind(event.address);
  let count = contract.stakeCount(event.params.user).toI32();

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
    geyser.users = geyser.users.minus(BigInt.fromI32(1));
  }

  // update general info
  user.operations = user.operations.plus(BigInt.fromI32(1));
  geyser.operations = geyser.operations.plus(BigInt.fromI32(1));

  // create new unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.type = 'Unstake';
  transaction.timestamp = event.block.timestamp;
  transaction.geyser = geyser.id;
  transaction.user = user.id;
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pricing info
  stakingToken.price = getPrice(stakingToken);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken);
  rewardToken.updated = event.block.timestamp;

  updatePricing(geyser, contract, stakingToken, rewardToken, event.block.timestamp);
  geyser.updated = event.block.timestamp;

  // store
  user.save();
  geyser.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
}


export function handleRewardsFunded(event: RewardsFunded): void {
  let geyser = Geyser.load(event.address.toHexString())!;
  let stakingToken = Token.load(geyser.stakingToken)!;
  let rewardToken = Token.load(geyser.rewardToken)!;

  let contract = GeyserContract.bind(event.address);

  let amount = integerToDecimal(event.params.amount, rewardToken.decimals)
  geyser.rewards = geyser.rewards.plus(amount);
  geyser.funded = geyser.funded.plus(amount);

  // update pricing info
  stakingToken.price = getPrice(stakingToken!);
  stakingToken.updated = event.block.timestamp;
  rewardToken.price = getPrice(rewardToken!);
  rewardToken.updated = event.block.timestamp;

  updatePricing(geyser, contract, stakingToken, rewardToken, event.block.timestamp);
  geyser.updated = event.block.timestamp;

  // update timeframe for geyser
  if (event.params.start.lt(geyser.start) || geyser.start.equals(ZERO_BIG_INT)) {
    geyser.start = event.params.start;
  }
  let end = event.params.start.plus(event.params.duration);
  if (end.gt(geyser.end) || geyser.end.equals(ZERO_BIG_INT)) {
    geyser.end = end;
  }

  // TODO: map of reward rates over time

  // update platform
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    platform = new Platform(ZERO_ADDRESS);
    platform.tvl = ZERO_BIG_DECIMAL;
    platform._geysers = [];
  }
  if (!platform._geysers.includes(geyser.id)) {
    platform._geysers = platform._geysers.concat([geyser.id]);
    platform.save();
  }

  // store
  geyser.save();
  stakingToken.save();
  rewardToken.save();
}


export function handleRewardsDistributed(event: RewardsDistributed): void {
  let geyser = Geyser.load(event.address.toHexString());
  let token = Token.load(geyser.rewardToken);

  let amount = integerToDecimal(event.params.amount, token.decimals);
  geyser.rewards = geyser.rewards.minus(amount);
  geyser.distributed = geyser.distributed.plus(amount);

  // update unstake transaction earnings
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.earnings = amount;

  geyser.save();
  transaction.save();
}


export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  let geyser = Geyser.load(event.address.toHexString());
  let newOwner = User.load(event.params.newOwner.toHexString());
  if (newOwner == null) {
    newOwner = createNewUser(event.params.newOwner);
    newOwner.save()
  }

  geyser.owner = newOwner.id;

  geyser.save();
}


export function handleRewardsUnlocked(event: RewardsUnlocked): void {
  // todo
}


export function handleRewardsExpired(event: RewardsExpired): void {
  // todo
}


export function handleGysrSpent(event: GysrSpent): void {
  // update gysr spent on unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.gysrSpent = integerToDecimal(event.params.amount, BigInt.fromI32(18));

  transaction.save();
}

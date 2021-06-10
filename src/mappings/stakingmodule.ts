// ERC20 staking module event handling and mapping


import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import {
  ERC20StakingModule as ERC20StakingModuleContract,
  Staked,
  Unstaked,
  Claimed
} from '../../generated/templates/ERC20StakingModule/ERC20StakingModule'
import { Pool, Token, User, Position, Stake, Platform, Transaction } from '../../generated/schema'
import { integerToDecimal, createNewUser, updatePoolDayData } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePool } from '../util/pool'


export function handleStaked(event: Staked): void {
  // load
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
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
  stake.shares = integerToDecimal(event.params.shares);
  stake.timestamp = event.block.timestamp;

  position.shares = position.shares.plus(integerToDecimal(event.params.shares));
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
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);
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


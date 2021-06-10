// ERC20 staking module event handling and mapping
import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import {
  ERC20StakingModule as ERC20StakingModuleContract,
  Staked,
  Unstaked,
  Claimed
} from '../../generated/templates/ERC20StakingModule/ERC20StakingModule'
import { Pool as PoolContract, } from '../../generated/templates/ERC20StakingModule/Pool'
import { ERC20CompetitiveRewardModule as ERC20CompetitiveRewardModuleContract } from '../../generated/templates/ERC20StakingModule/ERC20CompetitiveRewardModule'
import { ERC20FriendlyRewardModule as ERC20FriendlyRewardModuleContract } from '../../generated/templates/ERC20StakingModule/ERC20FriendlyRewardModule'
import { Pool, Token, User, Position, Stake, Platform, Transaction } from '../../generated/schema'
import { integerToDecimal, createNewUser, updatePoolDayData } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN } from '../util/constants'
import { updatePool } from '../util/pool'


export function handleStaked(event: Staked): void {
  // load pool and tokens
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


export function handleUnstaked(event: Unstaked): void {
  // load pool and token
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS)!;

  // load user
  let user = User.load(event.params.user.toHexString());

  // load position
  let positionId = pool.id + '_' + user.id;
  let position = Position.load(positionId);

  // get position data from contract
  let count = 0;
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  let poolContract = PoolContract.bind(Address.fromString(pool.id));
  if (pool.poolType == 'GeyserV2') {
    // competitive
    let rewardContract = ERC20CompetitiveRewardModuleContract.bind(poolContract.rewardModule());
    count = rewardContract.stakeCount(event.params.user).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      shares = integerToDecimal(s.value0, stakingToken.decimals);
      ts = s.value1;
    }

  } else {
    // friendly
    let rewardContract = ERC20FriendlyRewardModuleContract.bind(poolContract.rewardModule());
    count = rewardContract.stakeCount(event.params.user).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      shares = integerToDecimal(s.value0, stakingToken.decimals);
      ts = s.value4;
    }
  }

  // format unstake amount
  let unstakeAmount = integerToDecimal(event.params.amount, stakingToken.decimals);

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete any trailing stakes that we know have been removed
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i]);

    // verify position timestamps
    if (ts != stake.timestamp) {
      log.error(
        'Stake timestamps not equal: {} != {}',
        [stake.timestamp.toString(), ts.toString()]
      )
    }

    // set updated share amount
    stake.shares = shares;
    stake.save();
    break;
  }

  // update position info
  position.shares = integerToDecimal(contract.shares(event.params.user), stakingToken.decimals);
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
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);

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

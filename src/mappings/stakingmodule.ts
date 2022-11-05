// ERC20 staking module event handling and mapping
import { Address, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts'
import {
  ERC20StakingModule as ERC20StakingModuleContract,
  Staked,
  Unstaked,
  Claimed
} from '../../generated/templates/StakingModule/ERC20StakingModule'
import { Pool as PoolContract, } from '../../generated/templates/StakingModule/Pool'
import { ERC20CompetitiveRewardModuleV2 } from '../../generated/templates/StakingModule/ERC20CompetitiveRewardModuleV2'
import { ERC20CompetitiveRewardModuleV3 } from '../../generated/templates/StakingModule/ERC20CompetitiveRewardModuleV3'
import { ERC20FriendlyRewardModuleV2 } from '../../generated/templates/StakingModule/ERC20FriendlyRewardModuleV2'
import { ERC20FriendlyRewardModuleV3 } from '../../generated/templates/StakingModule/ERC20FriendlyRewardModuleV3'
import { Pool, Token, User, Position, Stake, Platform, Transaction } from '../../generated/schema'
import { integerToDecimal, createNewUser, updatePoolDayData, updatePlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, PRICING_MIN_TVL } from '../util/constants'
import { updatePool } from '../util/pool'


export function handleStaked(event: Staked): void {
  // load pool and tokens
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

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
  stake.shares = integerToDecimal(event.params.shares, stakingToken.decimals);
  stake.timestamp = event.block.timestamp;

  position.shares = position.shares.plus(stake.shares);
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
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pool data
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  // update volume
  let dollarAmount = transaction.amount!.times(stakingToken.price);
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  // update platform pricing
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    log.info('Adding pool to active pricing {}', [pool.id.toString()]);
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, pool);

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
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  // load user
  let user = User.load(event.params.user.toHexString())!;

  // load position
  let positionId = pool.id + '_' + user.id;
  let position = Position.load(positionId)!;

  // get position data from contract
  let count = 0;
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  let poolContract = PoolContract.bind(Address.fromString(pool.id));
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    // competitive
    let rewardContract = ERC20CompetitiveRewardModuleV2.bind(poolContract.rewardModule());
    count = rewardContract.stakeCount(event.params.user).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      shares = integerToDecimal(s.value0, stakingToken.decimals);
      ts = s.value1;
    }

  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    // competitive
    let rewardContract = ERC20CompetitiveRewardModuleV3.bind(poolContract.rewardModule());
    let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
    count = rewardContract.stakeCount(account).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
      shares = integerToDecimal(s.value0, stakingToken.decimals);
      ts = s.value1;
    }

  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    // friendly
    let rewardContract = ERC20FriendlyRewardModuleV2.bind(poolContract.rewardModule());
    count = rewardContract.stakeCount(event.params.user).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      shares = integerToDecimal(s.value0, stakingToken.decimals);
      ts = s.value4;
    }

  } else {
    // friendly
    let rewardContract = ERC20FriendlyRewardModuleV3.bind(poolContract.rewardModule());
    let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
    count = rewardContract.stakeCount(account).toI32();

    if (count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
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
    let stake = Stake.load(stakes[i])!;

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
  position.shares = position.shares.minus(
    integerToDecimal(event.params.shares, stakingToken.decimals)
  );
  position.stakes = stakes;
  if (position.shares.gt(ZERO_BIG_DECIMAL)) {
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

  // update pool data
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  // update platform pricing
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    log.info('Adding pool to active pricing {}', [pool.id.toString()]);
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, pool);

  // store
  user.save();
  pool.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
  platform.save();
  poolDayData.save();
}


export function handleClaimed(event: Claimed): void {
  // load pool and token
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  // load user
  let user = User.load(event.params.user.toHexString())!;

  // load position
  let positionId = pool.id + '_' + user.id;
  let position = Position.load(positionId)!;

  // update current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  // note: should encapsulate this behind an interface when we have additional module types
  let poolContract = PoolContract.bind(Address.fromString(pool.id));
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    // competitive
    let rewardContract = ERC20CompetitiveRewardModuleV2.bind(poolContract.rewardModule());
    let count = rewardContract.stakeCount(event.params.user).toI32();

    if (count == stakes.length && count > 0) {
      // update timestamp for last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      let stake = Stake.load(stakes[count - 1])!;
      stake.timestamp = s.value1;
      stake.save();
    } else {
      // rebuild stakes list
      for (let i = 0; i < stakes.length; i++) {
        store.remove('Stake', stakes[i]);
      }
      stakes = [];
      for (let i = 0; i < count; i++) {
        let s = rewardContract.stakes(event.params.user, BigInt.fromI32(i));
        let stakeId = positionId + '_' + i.toString();

        let stake = new Stake(stakeId);
        stake.position = position.id;
        stake.user = user.id;
        stake.pool = pool.id;
        stake.shares = integerToDecimal(s.value0, stakingToken.decimals);
        stake.timestamp = s.value1;

        stake.save();

        stakes = stakes.concat([stake.id]);
      }
    }

  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    // competitive
    let rewardContract = ERC20CompetitiveRewardModuleV3.bind(poolContract.rewardModule());
    let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
    let count = rewardContract.stakeCount(account).toI32();

    if (count == stakes.length && count > 0) {
      // update timestamp for last position
      let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
      let stake = Stake.load(stakes[count - 1])!;
      stake.timestamp = s.value1;
      stake.save();
    } else {
      // rebuild stakes list
      for (let i = 0; i < stakes.length; i++) {
        store.remove('Stake', stakes[i]);
      }
      stakes = [];
      for (let i = 0; i < count; i++) {
        let s = rewardContract.stakes(account, BigInt.fromI32(i));
        let stakeId = positionId + '_' + i.toString();

        let stake = new Stake(stakeId);
        stake.position = position.id;
        stake.user = user.id;
        stake.pool = pool.id;
        stake.shares = integerToDecimal(s.value0, stakingToken.decimals);
        stake.timestamp = s.value1;

        stake.save();

        stakes = stakes.concat([stake.id]);
      }
    }

  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    // friendly
    let rewardContract = ERC20FriendlyRewardModuleV2.bind(poolContract.rewardModule());
    let count = rewardContract.stakeCount(event.params.user).toI32();

    if (count == stakes.length && count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
      let stake = Stake.load(stakes[count - 1])!;
      stake.timestamp = s.value4;
      stake.save();
    } else {
      // rebuild stakes list
      for (let i = 0; i < stakes.length; i++) {
        store.remove('Stake', stakes[i]);
      }
      stakes = [];
      for (let i = 0; i < count; i++) {
        let s = rewardContract.stakes(event.params.user, BigInt.fromI32(i));
        let stakeId = positionId + '_' + i.toString();

        let stake = new Stake(stakeId);
        stake.position = position.id;
        stake.user = user.id;
        stake.pool = pool.id;
        stake.shares = integerToDecimal(s.value0, stakingToken.decimals);
        stake.timestamp = s.value4;

        stake.save();

        stakes = stakes.concat([stake.id]);
      }
    }

  } else {
    // friendly
    let rewardContract = ERC20FriendlyRewardModuleV3.bind(poolContract.rewardModule());
    let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
    let count = rewardContract.stakeCount(account).toI32();

    if (count == stakes.length && count > 0) {
      // get info for updated last position
      let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
      let stake = Stake.load(stakes[count - 1])!;
      stake.timestamp = s.value4;
      stake.save();
    } else {
      // rebuild stakes list
      for (let i = 0; i < stakes.length; i++) {
        store.remove('Stake', stakes[i]);
      }
      stakes = [];
      for (let i = 0; i < count; i++) {
        let s = rewardContract.stakes(account, BigInt.fromI32(i));
        let stakeId = positionId + '_' + i.toString();

        let stake = new Stake(stakeId);
        stake.position = position.id;
        stake.user = user.id;
        stake.pool = pool.id;
        stake.shares = integerToDecimal(s.value0, stakingToken.decimals);
        stake.timestamp = s.value4;

        stake.save();

        stakes = stakes.concat([stake.id]);
      }
    }
  }

  // update position info
  position.stakes = stakes;
  // overall shares cannot change here

  // update general info
  user.operations = user.operations.plus(BigInt.fromI32(1));
  pool.operations = pool.operations.plus(BigInt.fromI32(1));
  platform.operations = platform.operations.plus(BigInt.fromI32(1));

  // create new claim transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.type = 'Claim';
  transaction.timestamp = event.block.timestamp;
  transaction.pool = pool.id;
  transaction.user = user.id;
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pricing info
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);

  // not considering claim amount in volume

  // update daily pool info
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  // update platform pricing
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, pool);

  // store
  user.save();
  position.save();
  pool.save();
  stakingToken.save();
  rewardToken.save();
  transaction.save();
  platform.save();
  poolDayData.save();
}

// ERC20 staking module event handling and mapping
import { Address, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts'
import {
  ERC20StakingModule as ERC20StakingModuleContract,
  Staked,
  Unstaked,
  Claimed
} from '../../generated/templates/StakingModule/ERC20StakingModule'
import { Pool as PoolContract, } from '../../generated/templates/StakingModule/Pool'
import { Pool, Token, User, Position, Stake, Platform, Transaction } from '../../generated/schema'
import { integerToDecimal, createNewUser, updatePoolDayData, updatePlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, PRICING_MIN_TVL, BASE_REWARD_MODULE_TYPES } from '../util/constants'
import { updatePool } from '../util/pool'
import { handleClaimedCompetitiveV2, handleClaimedCompetitiveV3, handleStakedCompetitive, handleUnstakedCompetitiveV2, handleUnstakedCompetitiveV3 } from '../modules/erc20competitive'
import { handleClaimedFriendlyV2, handleClaimedFriendlyV3, handleUnstakedFriendlyV2, handleUnstakedFriendlyV3 } from '../modules/erc20friendly'


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

  // module specific logic
  if (BASE_REWARD_MODULE_TYPES.includes(pool.rewardModuleType)) {
    handleStakedCompetitive(event, pool, user, position, stakingToken);
  }

  // update position
  position.shares = position.shares.plus(
    integerToDecimal(event.params.shares, stakingToken.decimals)
  );
  position.updated = event.block.timestamp;

  // increment
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

  // module specific handling
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    handleUnstakedCompetitiveV2(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    handleUnstakedCompetitiveV3(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    handleUnstakedFriendlyV2(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV3') {
    handleUnstakedFriendlyV3(event, pool, user, position, stakingToken);
  }

  // update position info
  position.shares = position.shares.minus(
    integerToDecimal(event.params.shares, stakingToken.decimals)
  );
  if (position.shares.gt(ZERO_BIG_DECIMAL)) {
    position.updated = event.block.timestamp;
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
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);
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

  // note: should encapsulate this behind an interface when we have additional module types
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    handleClaimedCompetitiveV2(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    handleClaimedCompetitiveV3(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    handleClaimedFriendlyV2(event, pool, user, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV3') {
    handleClaimedFriendlyV3(event, pool, user, position, stakingToken);
  }

  // update position info
  // overall shares cannot change here
  position.updated = event.block.timestamp;

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

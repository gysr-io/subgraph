// ERC20 staking module event handling and mapping
import { Address, BigInt, Bytes, log, store, ethereum } from '@graphprotocol/graph-ts';
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/templates/StakingModule/ERC20StakingModule';
import {
  Staked as StakedV2,
  Unstaked as UnstakedV2,
  Claimed as ClaimedV2,
  Staked1 as StakedV3,
  Unstaked1 as UnstakedV3,
  Claimed1 as ClaimedV3,
  Fee as FeeEvent
} from '../../generated/templates/StakingModule/Events';
import { Fee as RewardModuleFeeEvent } from '../../generated/templates/RewardModule/Events';
import { Pool as PoolContract } from '../../generated/templates/StakingModule/Pool';
import {
  Pool,
  Token,
  User,
  Position,
  Stake,
  Platform,
  Transaction,
  PoolStakingToken,
  PoolRewardToken
} from '../../generated/schema';
import {
  integerToDecimal,
  addressToBytes32,
  bytes32ToAddress,
  createNewUser,
  updatePoolDayData,
  updatePlatform,
  loadPoolTokens,
  savePoolTokens
} from '../util/common';
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  ZERO_ADDRESS,
  PRICING_MIN_TVL,
  BASE_REWARD_MODULE_TYPES
} from '../util/constants';
import { updatePool } from '../util/pool';
import {
  handleClaimedCompetitiveV2,
  handleClaimedCompetitiveV3,
  handleStakedCompetitive,
  handleUnstakedCompetitiveV2,
  handleUnstakedCompetitiveV3
} from '../modules/erc20competitive';
import {
  handleClaimedFriendlyV2,
  handleClaimedFriendlyV3,
  handleUnstakedFriendlyV2,
  handleUnstakedFriendlyV3
} from '../modules/erc20friendly';
import { handleFee as rewardModuleHandleFee } from './rewardmodule';

export function handleStaked(event: StakedV3): void {
  // load pool and tokens
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;
  let tokens = new Map<String, Token>();
  let stakingTokens = new Map<String, PoolStakingToken>();
  let rewardTokens = new Map<String, PoolRewardToken>();
  loadPoolTokens(pool, tokens, stakingTokens, rewardTokens);

  // get user from position
  // TODO handle tokenized positions
  let userAddress = bytes32ToAddress(event.params.account);

  // load or create user
  let user = User.load(userAddress.toHexString());

  if (user === null) {
    user = createNewUser(userAddress);
    platform.users = platform.users.plus(BigInt.fromI32(1));
  }

  // load or create position
  let positionId = pool.id + '_' + event.params.account.toHexString();

  let position = Position.load(positionId);

  if (position === null) {
    position = new Position(positionId);
    position.account = event.params.account.toHexString();
    position.user = user.id;
    position.pool = pool.id;
    position.shares = ZERO_BIG_DECIMAL;
    position.stakes = [];

    pool.users = pool.users.plus(BigInt.fromI32(1));
  }

  // get staking token
  let stakingToken: Token;
  if (pool.stakingModuleType == 'ERC20Bond') {
    stakingToken = tokens.values()[0]; // TODO
  } else {
    stakingToken = tokens.values()[0];
  }

  // module specific logic
  if (BASE_REWARD_MODULE_TYPES.includes(pool.rewardModuleType)) {
    handleStakedCompetitive(event, pool, position, stakingToken);
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
  let transaction = new Transaction(event.transaction.hash.toHexString()); // TODO unique id
  transaction.type = 'Stake';
  transaction.timestamp = event.block.timestamp;
  transaction.pool = pool.id;
  transaction.user = user.id;
  transaction.amount = integerToDecimal(event.params.amount, stakingToken.decimals);
  transaction.earnings = ZERO_BIG_DECIMAL;
  transaction.gysrSpent = ZERO_BIG_DECIMAL;

  // update pool data
  updatePool(pool, platform, tokens, stakingTokens, rewardTokens, event.block.timestamp);
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
  savePoolTokens(tokens, stakingTokens, rewardTokens);
  transaction.save();
  platform.save();
  poolDayData.save();
}

export function handleUnstaked(event: UnstakedV3): void {
  // load pool and tokens
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  let tokens = new Map<String, Token>();
  let stakingTokens = new Map<String, PoolStakingToken>();
  let rewardTokens = new Map<String, PoolRewardToken>();
  loadPoolTokens(pool, tokens, stakingTokens, rewardTokens);

  // load position
  let positionId = pool.id + '_' + event.params.account.toHexString();
  let position = Position.load(positionId)!;

  // get user from position
  // TODO handle tokenized positions
  let userAddress = bytes32ToAddress(event.params.account);

  // load user
  let user = User.load(userAddress.toHexString())!;

  // get staking token
  let stakingToken: Token;
  if (pool.stakingModuleType == 'ERC20Bond') {
    stakingToken = tokens.values()[0]; // TODO
  } else {
    stakingToken = tokens.values()[0];
  }

  // module specific handling
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    handleUnstakedCompetitiveV2(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    handleUnstakedCompetitiveV3(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    handleUnstakedFriendlyV2(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV3') {
    handleUnstakedFriendlyV3(event, pool, position, stakingToken);
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
  updatePool(pool, platform, tokens, stakingTokens, rewardTokens, event.block.timestamp);
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
  savePoolTokens(tokens, stakingTokens, rewardTokens);
  transaction.save();
  platform.save();
  poolDayData.save();
}

export function handleClaimed(event: ClaimedV3): void {
  // load pool and tokens
  let contract = ERC20StakingModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  let tokens = new Map<String, Token>();
  let stakingTokens = new Map<String, PoolStakingToken>();
  let rewardTokens = new Map<String, PoolRewardToken>();
  loadPoolTokens(pool, tokens, stakingTokens, rewardTokens);

  // load position
  let positionId = pool.id + '_' + event.params.account.toHexString();
  let position = Position.load(positionId)!;

  // get user from position
  // TODO handle tokenized positions
  let userAddress = bytes32ToAddress(event.params.account);

  // load user
  let user = User.load(userAddress.toHexString())!;

  // get staking token
  let stakingToken: Token;
  if (pool.stakingModuleType == 'ERC20Bond') {
    stakingToken = tokens.values()[0]; // TODO
  } else {
    stakingToken = tokens.values()[0];
  }

  // note: should encapsulate this behind an interface when we have additional module types
  if (pool.rewardModuleType == 'ERC20CompetitiveV2') {
    handleClaimedCompetitiveV2(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20CompetitiveV3') {
    handleClaimedCompetitiveV3(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV2') {
    handleClaimedFriendlyV2(event, pool, position, stakingToken);
  } else if (pool.rewardModuleType == 'ERC20FriendlyV3') {
    handleClaimedFriendlyV3(event, pool, position, stakingToken);
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
  updatePool(pool, platform, tokens, stakingTokens, rewardTokens, event.block.timestamp);

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
  savePoolTokens(tokens, stakingTokens, rewardTokens);
  transaction.save();
  platform.save();
  poolDayData.save();
}

export function handleFee(event: FeeEvent): void {
  const e = new RewardModuleFeeEvent(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    event.parameters
  );
  rewardModuleHandleFee(e);
}

// v2 legacy compatibility
export function handleStakedV2(event: StakedV2): void {
  const account = new ethereum.EventParam(
    'account',
    ethereum.Value.fromBytes(addressToBytes32(event.params.user))
  );
  const e = new StakedV3(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    [account].concat(event.parameters)
  );
  handleStaked(e);
}

export function handleUnstakedV2(event: UnstakedV2): void {
  const account = new ethereum.EventParam(
    'account',
    ethereum.Value.fromBytes(addressToBytes32(event.params.user))
  );
  const e = new UnstakedV3(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    [account].concat(event.parameters)
  );
  handleUnstaked(e);
}

export function handleClaimedV2(event: ClaimedV2): void {
  const account = new ethereum.EventParam(
    'account',
    ethereum.Value.fromBytes(addressToBytes32(event.params.user))
  );
  const e = new ClaimedV3(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    [account].concat(event.parameters)
  );
  handleClaimed(e);
}

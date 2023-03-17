// V2 and V3 Pool Factory event handling and mapping

import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';
import { PoolCreated } from '../../generated/PoolFactory/PoolFactory';
import { Pool as PoolContract } from '../../generated/PoolFactory/Pool';
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/PoolFactory/ERC20StakingModule';
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/PoolFactory/ERC20BaseRewardModule';
import { ERC20CompetitiveRewardModule as ERC20CompetitiveRewardModuleContract } from '../../generated/PoolFactory/ERC20CompetitiveRewardModule';
import { ERC20FriendlyRewardModule as ERC20FriendlyRewardModuleContract } from '../../generated/PoolFactory/ERC20FriendlyRewardModule';
import { ERC20LinearRewardModule as ERC20LinearRewardModuleContract } from '../../generated/PoolFactory/ERC20LinearRewardModule';
import { ERC20MultiRewardModule as ERC20MultiRewardModuleContract } from '../../generated/PoolFactory/ERC20MultiRewardModule';
import { Pool, Platform, Token, User } from '../../generated/schema';
import {
  Pool as PoolTemplate,
  RewardModule as RewardModuleTemplate,
  StakingModule as StakingModuleTemplate
} from '../../generated/templates';
import {
  integerToDecimal,
  createNewUser,
  createNewPlatform,
  createNewStakingToken,
  createNewRewardToken
} from '../util/common';
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  INITIAL_SHARES_PER_TOKEN,
  ZERO_ADDRESS,
  ASSIGNMENT_STAKING_MODULE_FACTORIES,
  ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V2,
  ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V3,
  ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V2,
  ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V3,
  ERC20_LINEAR_REWARD_MODULE_FACTORIES,
  ERC20_STAKING_MODULE_FACTORIES,
  ERC721_STAKING_MODULE_FACTORIES,
  ONE_E_18,
  ERC20_MULTI_REWARD_MODULE_FACTORIES
} from '../util/constants';
import { createNewToken } from '../pricing/token';

export function handlePoolCreated(event: PoolCreated): void {
  // interface to actual Pool contract
  let contract = PoolContract.bind(event.params.pool);

  // modules
  let stakingModule = contract.stakingModule();
  let stakingModuleContract = ERC20StakingModuleContract.bind(stakingModule);
  let rewardModule = contract.rewardModule();
  let rewardModuleContract = ERC20BaseRewardModuleContract.bind(rewardModule);

  // platform
  let platform = Platform.load(ZERO_ADDRESS.toHexString());

  if (platform === null) {
    platform = createNewPlatform();
  }

  // user
  let user = User.load(event.params.user.toHexString());

  if (user == null) {
    user = createNewUser(event.params.user);
    platform.users = platform.users.plus(BigInt.fromI32(1));
  }

  // pool entity
  let pool = new Pool(event.params.pool.toHexString());
  pool.owner = user.id;
  pool.stakingModule = stakingModule.toHexString();
  pool.rewardModule = rewardModule.toHexString();

  // reward type
  let rewardFactory = rewardModuleContract.factory();
  if (ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V2.includes(rewardFactory)) {
    let competitiveContract = ERC20CompetitiveRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(competitiveContract.bonusMin());
    pool.timeMultMax = integerToDecimal(competitiveContract.bonusMax());
    pool.timePeriod = competitiveContract.bonusPeriod();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20CompetitiveV2';
  } else if (ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V3.includes(rewardFactory)) {
    let competitiveContract = ERC20CompetitiveRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(competitiveContract.bonusMin());
    pool.timeMultMax = integerToDecimal(competitiveContract.bonusMax());
    pool.timePeriod = competitiveContract.bonusPeriod();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20CompetitiveV3';
  } else if (ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V2.includes(rewardFactory)) {
    let friendlyContract = ERC20FriendlyRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(friendlyContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = friendlyContract.vestingPeriod();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20FriendlyV2';
  } else if (ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V3.includes(rewardFactory)) {
    let friendlyContract = ERC20FriendlyRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(friendlyContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = friendlyContract.vestingPeriod();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20FriendlyV3';
  } else if (ERC20_LINEAR_REWARD_MODULE_FACTORIES.includes(rewardFactory)) {
    let linearContract = ERC20LinearRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = BigDecimal.fromString('1');
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = linearContract.period();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20Linear';
  } else if (ERC20_MULTI_REWARD_MODULE_FACTORIES.includes(rewardFactory)) {
    let multiContract = ERC20MultiRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(multiContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = multiContract.vestingPeriod();
    pool.timeMultPeriod = pool.timePeriod;
    pool.rewardModuleType = 'ERC20Multi';
  } else {
    log.info('unknown reward module type: {}', [rewardFactory.toHexString()]);
    return;
  }

  // staking type
  let stakingFactory = stakingModuleContract.factory();
  if (ERC20_STAKING_MODULE_FACTORIES.includes(stakingFactory)) {
    pool.stakingModuleType = 'ERC20';
    pool.stakingSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  } else if (ERC721_STAKING_MODULE_FACTORIES.includes(stakingFactory)) {
    pool.stakingModuleType = 'ERC721';
    pool.stakingSharesPerToken = ONE_E_18;
  } else if (ASSIGNMENT_STAKING_MODULE_FACTORIES.includes(stakingFactory)) {
    pool.stakingModuleType = 'Assignment';
    pool.stakingSharesPerToken = ONE_E_18;
  } else {
    log.info('unknown staking module type: {}', [stakingFactory.toHexString()]);
    return;
  }

  // type nickname
  pool.poolType = 'Unknown';
  if (pool.stakingModuleType == 'ERC20') {
    if (
      pool.rewardModuleType == 'ERC20CompetitiveV2' ||
      pool.rewardModuleType == 'ERC20CompetitiveV3'
    ) {
      pool.poolType = 'GeyserV2';
    } else if (
      pool.rewardModuleType == 'ERC20FriendlyV2' ||
      pool.rewardModuleType == 'ERC20FriendlyV3'
    ) {
      pool.poolType = 'Fountain';
    } else if (pool.rewardModuleType == 'ERC20Multi') {
      pool.poolType = 'Basin';
    }
  } else if (pool.stakingModuleType == 'ERC721') {
    if (pool.rewardModuleType == 'ERC20FriendlyV2' || pool.rewardModuleType == 'ERC20FriendlyV3') {
      pool.poolType = 'Aquarium';
    } else if (pool.rewardModuleType == 'ERC20Multi') {
      pool.poolType = 'Reef';
    }
  } else if (pool.stakingModuleType == 'Assignment') {
    if (pool.rewardModuleType == 'ERC20Linear') {
      pool.poolType = 'Stream';
    }
  }

  pool.createdBlock = event.block.number;
  pool.createdTimestamp = event.block.timestamp;

  let tags = '';

  // staking tokens
  let tokens = stakingModuleContract.tokens();
  let stakingTokens = pool.stakingTokens;
  for (let i = 0; i < tokens.length; i++) {
    // token
    let token = Token.load(tokens[i].toHexString());
    if (token === null) {
      token = createNewToken(tokens[i]);
      token.save();
    }
    if (i == 0) pool.stakingToken = token.id; // temporary backwards compatibility
    tags += token.symbol + ' ' + token.name + ' ' + token.alias + ' ';

    // pool staking token
    let poolStakingToken = createNewStakingToken(pool, token);
    poolStakingToken.save();
    stakingTokens.push(poolStakingToken.id);
  }
  pool.stakingTokens = stakingTokens;

  // reward tokens
  tokens = rewardModuleContract.tokens();
  let rewardTokens = pool.rewardTokens;
  for (let i = 0; i < tokens.length; i++) {
    // token
    let token = Token.load(tokens[i].toHexString());
    if (token === null) {
      token = createNewToken(tokens[i]);
      token.save();
    }
    if (i == 0) pool.rewardToken = token.id; // temporary backwards compatibility
    tags += token.symbol + ' ' + token.name + ' ' + token.alias + ' ';

    // pool reward token
    let poolRewardToken = createNewRewardToken(pool, token);
    poolRewardToken.save();
    rewardTokens.push(poolRewardToken.id);
  }
  pool.rewardTokens = rewardTokens;

  pool.tags = tags;

  pool.users = ZERO_BIG_INT;
  pool.operations = ZERO_BIG_INT;
  pool.staked = ZERO_BIG_DECIMAL;
  pool.rewards = ZERO_BIG_DECIMAL;
  pool.funded = ZERO_BIG_DECIMAL;
  pool.distributed = ZERO_BIG_DECIMAL;
  pool.gysrSpent = ZERO_BIG_DECIMAL;
  pool.gysrVested = ZERO_BIG_DECIMAL;
  pool.sharesPerSecond = ZERO_BIG_DECIMAL;
  pool.fundings = [];

  pool.start = ZERO_BIG_INT;
  pool.end = ZERO_BIG_INT;
  pool.state = 'Unfunded';
  pool.stakedUSD = ZERO_BIG_DECIMAL;
  pool.rewardsUSD = ZERO_BIG_DECIMAL;
  pool.tvl = ZERO_BIG_DECIMAL;
  pool.apr = ZERO_BIG_DECIMAL;
  pool.usage = ZERO_BIG_DECIMAL;
  pool.rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  pool.updated = ZERO_BIG_INT;
  pool.volume = ZERO_BIG_DECIMAL;

  platform.pools = platform.pools.plus(BigInt.fromI32(1));

  pool.save();
  user.save();
  platform.save();

  log.info('created new v2/v3 pool: {}, {}, {}', [pool.id, pool.poolType, tags]);

  // create template event handler
  PoolTemplate.create(event.params.pool);
  RewardModuleTemplate.create(rewardModuleContract._address);
  StakingModuleTemplate.create(stakingModuleContract._address);
}

// V2 and V3 Pool Factory event handling and mapping

import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { PoolCreated } from '../../generated/PoolFactory/PoolFactory'
import { Pool as PoolContract } from '../../generated/PoolFactory/Pool'
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/PoolFactory/ERC20StakingModule'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/PoolFactory/ERC20BaseRewardModule'
import { ERC20CompetitiveRewardModule as ERC20CompetitiveRewardModuleContract } from '../../generated/PoolFactory/ERC20CompetitiveRewardModule'
import { ERC20FriendlyRewardModule as ERC20FriendlyRewardModuleContract } from '../../generated/PoolFactory/ERC20FriendlyRewardModule'
import { ERC20LinearRewardModule as ERC20LinearRewardModuleContract } from '../../generated/PoolFactory/ERC20LinearRewardModule'
import { Pool, Platform, Token, User } from '../../generated/schema'
import {
  Pool as PoolTemplate,
  RewardModule as RewardModuleTemplate,
  StakingModule as StakingModuleTemplate
} from '../../generated/templates'
import { integerToDecimal, createNewUser, createNewPlatform } from '../util/common'
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
  ONE_E_18
} from '../util/constants'
import { createNewToken } from '../pricing/token'

export function handlePoolCreated(event: PoolCreated): void {

  // interface to actual Pool contract
  let contract = PoolContract.bind(event.params.pool);

  // modules
  let stakingModule = contract.stakingModule();
  let stakingModuleContract = ERC20StakingModuleContract.bind(stakingModule)
  let rewardModule = contract.rewardModule();
  let rewardModuleContract = ERC20BaseRewardModuleContract.bind(rewardModule);

  // staking token
  let stakingToken = Token.load(stakingModuleContract.tokens()[0].toHexString())

  if (stakingToken === null) {
    stakingToken = createNewToken(stakingModuleContract.tokens()[0]);
    stakingToken.save();
  }

  // reward token
  let rewardToken = Token.load(rewardModuleContract.tokens()[0].toHexString())

  if (rewardToken === null) {
    rewardToken = createNewToken(rewardModuleContract.tokens()[0]);
    rewardToken.save();
  }

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
  pool.stakingToken = stakingToken.id;
  pool.rewardToken = rewardToken.id;
  pool.stakingModule = stakingModule.toHexString();
  pool.rewardModule = rewardModule.toHexString();

  // reward type
  let rewardFactory = rewardModuleContract.factory();
  if (ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V2.includes(rewardFactory)) {
    let competitiveContract = ERC20CompetitiveRewardModuleContract.bind(rewardModule)
    pool.timeMultMin = integerToDecimal(competitiveContract.bonusMin());
    pool.timeMultMax = integerToDecimal(competitiveContract.bonusMax());
    pool.timePeriod = competitiveContract.bonusPeriod();
    pool.rewardModuleType = 'ERC20CompetitiveV2';
  } else if (ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V3.includes(rewardFactory)) {
    let competitiveContract = ERC20CompetitiveRewardModuleContract.bind(rewardModule)
    pool.timeMultMin = integerToDecimal(competitiveContract.bonusMin());
    pool.timeMultMax = integerToDecimal(competitiveContract.bonusMax());
    pool.timePeriod = competitiveContract.bonusPeriod();
    pool.rewardModuleType = 'ERC20CompetitiveV3';
  } else if (ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V2.includes(rewardFactory)) {
    let friendlyContract = ERC20FriendlyRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(friendlyContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = friendlyContract.vestingPeriod();
    pool.rewardModuleType = 'ERC20FriendlyV2';
  } else if (ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V3.includes(rewardFactory)) {
    let friendlyContract = ERC20FriendlyRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(friendlyContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = friendlyContract.vestingPeriod();
    pool.rewardModuleType = 'ERC20FriendlyV3';
  } else if (ERC20_LINEAR_REWARD_MODULE_FACTORIES.includes(rewardFactory)) {
    let linearContract = ERC20LinearRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = BigDecimal.fromString('1');
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timePeriod = linearContract.period();
    pool.rewardModuleType = 'ERC20Linear';
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
    if (pool.rewardModuleType == 'ERC20CompetitiveV2' || pool.rewardModuleType == 'ERC20CompetitiveV3') {
      pool.poolType = 'GeyserV2';
    } else {
      pool.poolType = 'Fountain'
    }
  } else if (pool.stakingModuleType == 'ERC721') {
    if (pool.rewardModuleType == 'ERC20FriendlyV2' || pool.rewardModuleType == 'ERC20FriendlyV3') {
      pool.poolType = 'Aquarium';
    }
  } else if (pool.stakingModuleType == 'Assignment') {
    if (pool.rewardModuleType == 'ERC20Linear') {
      pool.poolType = 'Stream'
    }
  }

  pool.createdBlock = event.block.number;
  pool.createdTimestamp = event.block.timestamp;
  pool.tags = (
    stakingToken.symbol
    + " " + stakingToken.name
    + " " + rewardToken.symbol
    + " " + rewardToken.name
  );

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

  log.info('created new v2/v3 pool: {}, {}, {}, {}', [pool.id, pool.poolType, stakingToken.symbol, rewardToken.symbol]);

  // create template event handler
  PoolTemplate.create(event.params.pool);
  RewardModuleTemplate.create(rewardModuleContract._address);
  StakingModuleTemplate.create(stakingModuleContract._address);
}

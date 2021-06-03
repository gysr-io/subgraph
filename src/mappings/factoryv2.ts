// V2 Pool Factory event handling and mapping

import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { PoolCreated } from '../../generated/PoolFactory/PoolFactory'
import { Pool as PoolContract } from '../../generated/PoolFactory/Pool'
import { ERC20StakingModule as ERC20StakingModuleContract } from '../../generated/PoolFactory/ERC20StakingModule'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/PoolFactory/ERC20BaseRewardModule'
import { ERC20CompetitiveRewardModule as ERC20CompetitiveRewardModuleContract } from '../../generated/PoolFactory/ERC20CompetitiveRewardModule'
import { ERC20FriendlyRewardModule as ERC20FriendlyRewardModuleContract } from '../../generated/PoolFactory/ERC20FriendlyRewardModule'
import { Pool, Platform, Token, User } from '../../generated/schema'
import { Pool as PoolTemplate } from '../../generated/templates'
import { integerToDecimal, createNewUser, createNewPlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN, ZERO_ADDRESS } from '../util/constants'
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
  let platform = Platform.load(ZERO_ADDRESS);

  if (platform === null) {
    platform = createNewPlatform();
  }

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

  // get bonus info
  let competitiveContract = ERC20CompetitiveRewardModuleContract.bind(rewardModule);
  let testBonusMin = competitiveContract.try_bonusMin()
  // if bonusMin call was reverted, we know that it is not a competitive reward module
  if (testBonusMin.reverted) {
    let friendlyContract = ERC20FriendlyRewardModuleContract.bind(rewardModule);
    pool.timeMultMin = integerToDecimal(friendlyContract.vestingStart());
    pool.timeMultMax = BigDecimal.fromString('1');
    pool.timeMultPeriod = friendlyContract.vestingPeriod();
    pool.poolType = 'Fountain'
  } else {
    pool.timeMultMin = integerToDecimal(testBonusMin.value);
    pool.timeMultMax = integerToDecimal(competitiveContract.bonusMax());
    pool.timeMultPeriod = competitiveContract.bonusPeriod();
    pool.poolType = 'GeyserV2'
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
  pool.sharesPerSecond = ZERO_BIG_DECIMAL;
  pool.fundings = [];

  pool.start = ZERO_BIG_INT;
  pool.end = ZERO_BIG_INT;
  pool.state = 'Unfunded';
  pool.stakedUSD = ZERO_BIG_DECIMAL;
  pool.rewardsUSD = ZERO_BIG_DECIMAL;
  pool.tvl = ZERO_BIG_DECIMAL;
  pool.apr = ZERO_BIG_DECIMAL;
  pool.stakingSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  pool.rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  pool.updated = ZERO_BIG_INT;
  pool.volume = ZERO_BIG_DECIMAL;

  platform.pools = platform.pools.plus(BigInt.fromI32(1));

  pool.save();
  user.save();
  platform.save();

  // create template event handler
  PoolTemplate.create(event.params.pool);
}

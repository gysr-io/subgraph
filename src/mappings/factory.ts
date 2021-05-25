// GYSR factory event handling and mapping

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { GeyserCreated } from '../../generated/GeyserV1Factory/GeyserV1Factory'
import { GeyserV1 as GeyserV1Contract } from '../../generated/GeyserV1Factory/GeyserV1'
import { Pool, Platform, Token, User } from '../../generated/schema'
import { GeyserV1 as GeyserV1Template } from '../../generated/templates'
import { integerToDecimal, createNewUser, createNewPlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN, ZERO_ADDRESS } from '../util/constants'
import { createNewToken } from '../pricing/token'


export function handleGeyserV1Created(event: GeyserCreated): void {

  // interface to actual Geyser contract
  let contract = GeyserV1Contract.bind(event.params.geyser);

  // staking token
  let stakingToken = Token.load(contract.stakingToken().toHexString())

  if (stakingToken === null) {
    stakingToken = createNewToken(contract.stakingToken());
    stakingToken.save();
  }

  // reward token
  let rewardToken = Token.load(contract.rewardToken().toHexString())

  if (rewardToken === null) {
    rewardToken = createNewToken(contract.rewardToken());
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
  let pool = new Pool(event.params.geyser.toHexString());
  pool.owner = user.id;
  pool.stakingToken = stakingToken.id;
  pool.rewardToken = rewardToken.id;
  pool.bonusMin = integerToDecimal(contract.bonusMin());
  pool.bonusMax = integerToDecimal(contract.bonusMax());
  pool.bonusPeriod = contract.bonusPeriod();
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
  pool.apy = ZERO_BIG_DECIMAL;
  pool.stakingSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  pool.rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  pool.updated = ZERO_BIG_INT;
  pool.volume = ZERO_BIG_DECIMAL;

  platform.pools = platform.pools.plus(BigInt.fromI32(1));

  pool.save();
  user.save();
  platform.save();

  // create template event handler
  GeyserV1Template.create(event.params.geyser);
}

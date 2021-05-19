// GYSR factory event handling and mapping

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { GeyserFactory, GeyserCreated } from '../../generated/GeyserFactory/GeyserFactory'
import { Geyser as GeyserContract } from '../../generated/GeyserFactory/Geyser'
import { ERC20 } from '../../generated/GeyserFactory/ERC20'
import { Geyser, Platform, Token, User } from '../../generated/schema'
import { Geyser as GeyserTemplate } from '../../generated/templates'
import { integerToDecimal, createNewUser, createNewPlatform } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN, ZERO_ADDRESS } from '../util/constants'
import { createNewToken } from '../pricing/token'


export function handleGeyserCreated(event: GeyserCreated): void {

  // interface to actual Geyser contract
  let contract = GeyserContract.bind(event.params.geyser);

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
    user = createNewUser(event.params.user, platform!);
  }

  // geyser entity
  let geyser = new Geyser(event.params.geyser.toHexString());
  geyser.owner = user.id;
  geyser.stakingToken = stakingToken.id;
  geyser.rewardToken = rewardToken.id;
  geyser.bonusMin = integerToDecimal(contract.bonusMin());
  geyser.bonusMax = integerToDecimal(contract.bonusMax());
  geyser.bonusPeriod = contract.bonusPeriod();
  geyser.createdBlock = event.block.number;
  geyser.createdTimestamp = event.block.timestamp;
  geyser.tags = (
    stakingToken.symbol
    + " " + stakingToken.name
    + " " + rewardToken.symbol
    + " " + rewardToken.name
  );

  geyser.users = ZERO_BIG_INT;
  geyser.operations = ZERO_BIG_INT;
  geyser.staked = ZERO_BIG_DECIMAL;
  geyser.rewards = ZERO_BIG_DECIMAL;
  geyser.funded = ZERO_BIG_DECIMAL;
  geyser.distributed = ZERO_BIG_DECIMAL;
  geyser.gysrSpent = ZERO_BIG_DECIMAL;
  geyser.sharesPerSecond = ZERO_BIG_DECIMAL;
  geyser.fundings = [];

  geyser.start = ZERO_BIG_INT;
  geyser.end = ZERO_BIG_INT;
  geyser.state = 'Unfunded';
  geyser.stakedUSD = ZERO_BIG_DECIMAL;
  geyser.rewardsUSD = ZERO_BIG_DECIMAL;
  geyser.tvl = ZERO_BIG_DECIMAL;
  geyser.apy = ZERO_BIG_DECIMAL;
  geyser.stakingSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  geyser.rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  geyser.updated = ZERO_BIG_INT;
  geyser.volume = ZERO_BIG_DECIMAL;

  platform.pools = platform.pools.plus(BigInt.fromI32(1));

  geyser.save();
  user.save();
  platform.save();

  // create template event handler
  GeyserTemplate.create(event.params.geyser);
}

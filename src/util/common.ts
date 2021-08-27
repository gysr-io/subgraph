// common utilities and helper functions

import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';
import { Platform, User, PoolDayData, Pool, Token } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, PRICING_PERIOD } from '../util/constants'
import { GeyserV1 as GeyserContractV1 } from '../../generated/templates/GeyserV1/GeyserV1'
import { updateGeyserV1 } from '../util/geyserv1'
import { updatePool } from '../util/pool'

export function integerToDecimal(value: BigInt, decimals: BigInt = BigInt.fromI32(18)): BigDecimal {
  let denom = BigInt.fromI32(10).pow(decimals.toI32() as u8);
  return value.toBigDecimal().div(denom.toBigDecimal());
}

export function createNewUser(address: Address): User {
  let user = new User(address.toHexString());
  user.operations = ZERO_BIG_INT;
  user.earned = ZERO_BIG_DECIMAL;

  return user;
}

export function createNewPlatform(): Platform {
  let platform = new Platform(ZERO_ADDRESS);
  platform.tvl = ZERO_BIG_DECIMAL;
  platform.users = ZERO_BIG_INT;
  platform.pools = ZERO_BIG_INT;
  platform.operations = ZERO_BIG_INT;
  platform.gysrSpent = ZERO_BIG_DECIMAL;
  platform.volume = ZERO_BIG_DECIMAL;
  platform._activePools = [];
  platform._updated = ZERO_BIG_INT;

  return platform;
}

export function updatePoolDayData(pool: Pool, timestamp: number): PoolDayData {
  let day = Math.floor(timestamp / 86400) as i32;
  let dayStartTimestamp = day * 86400; // will be 12:00am UTC due to rounding
  let id = pool.id + '_' + day.toString();

  let poolDayData = PoolDayData.load(id);
  if (poolDayData === null) {
    poolDayData = new PoolDayData(id);
    poolDayData.poolAddress = pool.id;
    poolDayData.date = dayStartTimestamp;
    poolDayData.volume = ZERO_BIG_DECIMAL;
  }

  poolDayData.totalStaked = pool.staked;
  poolDayData.totalGysrSpent = pool.gysrSpent;
  poolDayData.totalUsers = pool.users;
  poolDayData.tvl = pool.tvl;
  poolDayData.apr = pool.apr;
  poolDayData.usage = pool.usage;

  return poolDayData!;
}


export function updatePlatform(platform: Platform, timestamp: BigInt, skip: Pool): boolean {
  // skip if pricing period has not elapsed
  if (timestamp.minus(platform._updated).lt(PRICING_PERIOD)) {
    return false;
  }

  let pools = platform._activePools;
  var stale: string[] = [];

  log.info(
    'Running platform pricing update... ts: {}, pools: {}',
    [timestamp.toString(), BigInt.fromI32(pools.length).toString()]
  );

  for (let i = 0; i < pools.length; i++) {
    // don't need to price pool that triggered this event
    if (pools[i] == skip.id) {
      continue;
    }

    // load
    let pool = Pool.load(pools[i])!;
    let stakingToken = Token.load(pool.stakingToken)!;
    let rewardToken = Token.load(pool.rewardToken)!;

    // update pool
    if (pool.poolType == 'GeyserV1') {
      let contract = GeyserContractV1.bind(Address.fromString(pool.id));
      updateGeyserV1(pool, platform!, contract, stakingToken, rewardToken, timestamp);
    } else {
      updatePool(pool, platform!, stakingToken, rewardToken, timestamp);
    }

    // update pool day snapshot
    let poolDayData = updatePoolDayData(pool, timestamp.toI32());

    // store
    pool.save();
    stakingToken.save();
    rewardToken.save();
    poolDayData.save();

    // remove from priced pool list if stale
    if (pool.state == 'Stale') {
      stale.push(pool.id);
      log.info('Marking pool as stale {}', [pool.id.toString()]);
    }
  }

  if (stale.length) {
    platform._activePools = pools.filter((x) => !stale.includes(x));
  }
  platform._updated = timestamp;
  return true;
}

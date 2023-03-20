// common utilities and helper functions

import { Address, BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  Platform,
  User,
  PoolDayData,
  Pool,
  Token,
  PoolStakingToken,
  PoolRewardToken
} from '../../generated/schema';
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  ZERO_ADDRESS,
  PRICING_PERIOD,
  PRICING_MIN_TVL,
  INITIAL_SHARES_PER_TOKEN
} from '../util/constants';
import { GeyserV1 as GeyserContractV1 } from '../../generated/templates/GeyserV1/GeyserV1';
import { updateGeyserV1 } from '../util/geyserv1';
import { updatePool } from '../util/pool';

export function integerToDecimal(value: BigInt, decimals: BigInt = BigInt.fromI32(18)): BigDecimal {
  let denom = BigInt.fromI32(10).pow(decimals.toI32() as u8);
  return value.toBigDecimal().div(denom.toBigDecimal());
}

export function addressToBytes32(address: Address): Bytes {
  return Bytes.fromHexString(address.toHexString().padStart(64));
}

export function bytes32ToAddress(bytes: Bytes): Address {
  let b = Bytes.fromUint8Array(bytes.slice(12));
  return Address.fromBytes(b);
}

export function createNewUser(address: Address): User {
  let user = new User(address.toHexString());
  user.operations = ZERO_BIG_INT;
  user.earned = ZERO_BIG_DECIMAL;
  user.gysrSpent = ZERO_BIG_DECIMAL;

  return user;
}

export function createNewPlatform(): Platform {
  let platform = new Platform(ZERO_ADDRESS.toHexString());
  platform.tvl = ZERO_BIG_DECIMAL;
  platform.users = ZERO_BIG_INT;
  platform.pools = ZERO_BIG_INT;
  platform.operations = ZERO_BIG_INT;
  platform.gysrSpent = ZERO_BIG_DECIMAL;
  platform.gysrVested = ZERO_BIG_DECIMAL;
  platform.gysrFees = ZERO_BIG_DECIMAL;
  platform.volume = ZERO_BIG_DECIMAL;
  platform._activePools = [];
  platform._updated = ZERO_BIG_INT;

  return platform;
}

export function createNewStakingToken(pool: Pool, token: Token): PoolStakingToken {
  let staking = new PoolStakingToken(pool.id + '_' + token.id);
  staking.token = token.id;
  staking.amount = ZERO_BIG_DECIMAL;
  staking.sharesPerToken = INITIAL_SHARES_PER_TOKEN;
  return staking;
}

export function createNewRewardToken(pool: Pool, token: Token): PoolRewardToken {
  let reward = new PoolRewardToken(pool.id + '_' + token.id);
  reward.token = token.id;
  reward.amount = ZERO_BIG_DECIMAL;
  reward.sharesPerToken = INITIAL_SHARES_PER_TOKEN;
  reward.sharesPerSecond = ZERO_BIG_DECIMAL;
  reward.funded = ZERO_BIG_DECIMAL;
  reward.distributed = ZERO_BIG_DECIMAL;
  reward.withdrawn = ZERO_BIG_DECIMAL;
  return reward;
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
  poolDayData.totalGysrVested = pool.gysrVested;
  poolDayData.totalUsers = pool.users;
  poolDayData.tvl = pool.tvl;
  poolDayData.apr = pool.apr;
  poolDayData.usage = pool.usage;

  return poolDayData;
}

export function updatePlatform(platform: Platform, timestamp: BigInt, skip: Pool): boolean {
  // skip if pricing period has not elapsed
  if (timestamp.minus(platform._updated).lt(PRICING_PERIOD)) {
    return false;
  }

  let pools = platform._activePools;
  var stale: string[] = [];

  log.info('Running platform pricing update... ts: {}, pools: {}', [
    timestamp.toString(),
    BigInt.fromI32(pools.length).toString()
  ]);

  for (let i = 0; i < pools.length; i++) {
    // don't need to price pool that triggered this event
    if (pools[i] == skip.id) {
      continue;
    }

    // load
    let pool = Pool.load(pools[i])!;
    let tokens = new Map<String, Token>();
    let stakingTokens = new Map<String, PoolStakingToken>();
    let rewardTokens = new Map<String, PoolRewardToken>();
    loadPoolTokens(pool, tokens, stakingTokens, rewardTokens);

    // update pool
    if (pool.stakingModuleType == 'V1') {
      let contract = GeyserContractV1.bind(Address.fromString(pool.id));
      updateGeyserV1(pool, platform, contract, tokens, stakingTokens, rewardTokens, timestamp);
    } else {
      updatePool(pool, platform, tokens, stakingTokens, rewardTokens, timestamp);
    }

    // update pool day snapshot
    let poolDayData = updatePoolDayData(pool, timestamp.toI32());

    // store
    pool.save();
    savePoolTokens(tokens, stakingTokens, rewardTokens);
    poolDayData.save();

    // remove low TVL pools from priced list
    // note: no longer removing "stale" pools to support use cases with recurring zero duration funding
    if (pool.tvl.lt(PRICING_MIN_TVL)) {
      stale.push(pool.id);
      log.info('Removing low TVL pool from active pricing {} ({})', [
        pool.id.toString(),
        timestamp.toString()
      ]);
    }
  }

  if (stale.length) {
    let filtered: string[] = [];
    for (let i = 0; i < pools.length; i++) {
      if (stale.includes(pools[i])) continue;
      filtered.push(pools[i]);
    }
    platform._activePools = filtered;
  }
  platform._updated = timestamp;
  return true;
}

export function loadPoolTokens(
  pool: Pool,
  tokens: Map<String, Token>,
  staking: Map<String, PoolStakingToken>,
  rewards: Map<String, PoolRewardToken>
): void {
  for (let i = 0; i < pool.stakingTokens.length; i++) {
    let stakingToken = PoolStakingToken.load(pool.stakingTokens[i])!;
    staking.set(stakingToken.token, PoolStakingToken.load(pool.stakingTokens[i])!);
    tokens.set(stakingToken.token, Token.load(stakingToken.token)!);
  }
  for (let i = 0; i < pool.rewardTokens.length; i++) {
    let rewardToken = PoolRewardToken.load(pool.rewardTokens[i])!;
    rewards.set(rewardToken.token, PoolRewardToken.load(pool.rewardTokens[i])!);
    tokens.set(rewardToken.token, Token.load(rewardToken.token)!);
  }
}

export function savePoolTokens(
  tokens: Map<String, Token>,
  staking: Map<String, PoolStakingToken>,
  rewards: Map<String, PoolRewardToken>
): void {
  let keys = tokens.keys();
  for (let i = 0; i < keys.length; i++) tokens.get(keys[i]).save();
  keys = staking.keys();
  for (let i = 0; i < keys.length; i++) staking.get(keys[i]).save();
  keys = rewards.keys();
  for (let i = 0; i < keys.length; i++) rewards.get(keys[i]).save();
}

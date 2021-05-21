// common utilities and helper functions

import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';

import { Platform, User, PoolDayData, Geyser } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS } from '../util/constants'


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
  platform._geysers = [];

  return platform;
}

export function updatePoolDayData(geyser: Geyser, timestamp: number): PoolDayData {
  let day = Math.floor(timestamp / 86400) as i32;
  let dayStartTimestamp = day * 86400; // will be 12:00am UTC due to rounding
  let id = geyser.id + '_' + day.toString();

  let poolDayData = PoolDayData.load(id);
  if (poolDayData === null) {
    poolDayData = new PoolDayData(id);
    poolDayData.poolAddress = geyser.id;
    poolDayData.date = dayStartTimestamp;
    poolDayData.volume = ZERO_BIG_DECIMAL;
  }

  poolDayData.totalStaked = geyser.staked;
  poolDayData.totalGysrSpent = geyser.gysrSpent;
  poolDayData.totalUsers = geyser.users;
  poolDayData.volume = ZERO_BIG_DECIMAL;

  return poolDayData!;
}

// platform wide mappings

import { Address, BigInt, log, ethereum } from '@graphprotocol/graph-ts'
import { GeyserV1 as GeyserContractV1 } from '../../generated/templates/GeyserV1/GeyserV1'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/ERC20BaseRewardModule/ERC20BaseRewardModule'
import { Pool, Token, Platform } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_ADDRESS } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'
import { updatePoolDayData, integerToDecimal } from '../util/common'
import { updateGeyserV1 } from '../util/geyserv1'
import { updatePool } from '../util/pool'


export function handleUpdate(event: ethereum.Event): void {
  // run handler periodically to keep stats fresh
  //if (event.block.number.mod(BigInt.fromI32(1000)).notEqual(ZERO_BIG_INT)) {
  //  return;
  //}
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    return;
  }

  let pools = platform._activePools;
  var stale: string[] = [];

  for (let i = 0; i < pools.length; i++) {
    // load
    let pool = Pool.load(pools[i])!;
    let stakingToken = Token.load(pool.stakingToken)!;
    let rewardToken = Token.load(pool.rewardToken)!;

    // update pool
    if (pool.poolType == 'GeyserV1') {
      let contract = GeyserContractV1.bind(Address.fromString(pool.id));
      updateGeyserV1(pool, platform!, contract, stakingToken, rewardToken, event.block.timestamp);
    } else {
      updatePool(pool, platform!, stakingToken, rewardToken, event.block.timestamp);
    }

    // update pool day snapshot
    let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

    // store
    pool.save();
    stakingToken.save();
    rewardToken.save();
    platform.save();
    poolDayData.save();

    // remove from priced pool list if stale
    if (pool.state == 'Stale') {
      stale.push(pool.id);
      log.info('Marking pool as stale {}', [pool.id.toString()]);
    }
  }

  if (stale.length) {
    platform._activePools = pools.filter((x) => !stale.includes(x));
    platform.save();
  }
}

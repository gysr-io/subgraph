// V2 Pool event handling and mapping

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { OwnershipTransferred } from '../../generated/templates/Pool/Pool'
import { Pool, User, Platform } from '../../generated/schema'
import { createNewUser, createNewPlatform } from '../util/common'
import { ZERO_ADDRESS } from '../util/constants'


export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  let pool = Pool.load(event.address.toHexString());
  let newOwner = User.load(event.params.newOwner.toHexString());
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    platform = createNewPlatform();
  }

  if (newOwner == null) {
    newOwner = createNewUser(event.params.newOwner);
    platform.users = platform.users.plus(BigInt.fromI32(1));
    newOwner.save()
  }

  pool.owner = newOwner.id;

  pool.save();
  platform.save();
}

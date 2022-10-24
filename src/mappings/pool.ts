// V2 Pool event handling and mapping

import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { ControlTransferred } from '../../generated/templates/Pool/Pool'
import { Pool, User, Platform } from '../../generated/schema'
import { createNewUser, createNewPlatform } from '../util/common'
import { ZERO_ADDRESS } from '../util/constants'


export function handleControlTransferred(event: ControlTransferred): void {
  let pool = Pool.load(event.address.toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  let newOwner = User.load(event.params.newController.toHexString());
  if (newOwner == null) {
    newOwner = createNewUser(event.params.newController);
    platform.users = platform.users.plus(BigInt.fromI32(1));
    newOwner.save()
  }

  pool.owner = newOwner.id;

  pool.save();
  platform.save();
}

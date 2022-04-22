// pool metadata contract handling

import { log, json, Bytes } from '@graphprotocol/graph-ts'
import { Metadata } from '../../generated/PoolMetadata/PoolMetadata'
import { Pool } from '../../generated/schema'


export function handleMetadata(event: Metadata): void {
  // parse
  let res = json.try_fromBytes(Bytes.fromUTF8(event.params.data) as Bytes);
  if (res.isError) {
    log.info('unable to parse metadata for pool: {}', [event.params.pool.toHexString()]);
    return;
  }
  let data = res.value.toObject();

  // update pool object
  let pool = Pool.load(event.params.pool.toHexString());
  if (pool == null) {
    log.info('unable to find pool: {}', [event.params.pool.toHexString()]);
    return;
  }
  pool.name = '';
  pool.description = '';
  pool.website = '';

  let name = data.get('name');
  if (name) {
    if (!name.isNull()) {
      pool.name = name.toString();
    }
  }
  let description = data.get('description');
  if (description) {
    if (!description.isNull()) {
      pool.description = description.toString();
    }
  }
  let website = data.get('website');
  if (website) {
    if (!website.isNull()) {
      pool.website = website.toString();
    }
  }

  // write out
  pool.save();
  log.info('set metadata for pool: {}, {}, {}, {}', [pool.id, event.params.data, pool.name!, pool.description!]);
}

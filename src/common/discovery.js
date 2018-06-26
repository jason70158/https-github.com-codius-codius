/**
 * @fileOverview Host Discovery
 * @name discovery.js
 * @author Travis Crist
 */

const axios = require('axios')
const logger = require('riverpig')('codius-cli:discovery')
const sampleSize = require('lodash.samplesize')
const config = require('../config.js')
const { checkStatus } = require('../common/utils.js')

const HOSTS_PER_DISCOVERY = 4
const DISCOVERY_ATTEMPTS = 15

async function fetchHostPeers (host) {
  return new Promise((resolve, reject) => {
    axios.get(`${host}/peers`, {
      headers: { Accept: `application/codius-v${config.version.codius.min}+json` }
    }).then(async (res) => {
      if (checkStatus(res)) {
        resolve({ host, peers: res.data.peers })
      } else {
        resolve({
          host,
          error: res.error.toString() || 'Unknown Error Occurred',
          text: await res.text() || '',
          status: res.status || ''
        })
      }
    }).catch((error) => {
      resolve({ host, error: error.toString() })
    })
  })
}

async function findHosts (hostSample) {
  logger.debug(`Sending Peer Requests to Hosts: ${JSON.stringify(hostSample)}`)
  const fetchHostPeerPromises = hostSample.map((host) => fetchHostPeers(host))
  const responses = await Promise.all(fetchHostPeerPromises)
  const results = await responses.reduce((acc, curr) => {
    if (curr.error) {
      acc.failed = [...acc.failed, curr.host]
    } else {
      acc.success = [...acc.success, ...curr.peers]
    }
    return acc
  }, { success: [], failed: [] })
  return results
}

async function discoverHosts (targetCount) {
  let hostCount = 0
  let hostList = config.peers
  let badHosts = []
  for (let i = 0; i < DISCOVERY_ATTEMPTS; i++) {
    const hostSample = sampleSize(hostList, HOSTS_PER_DISCOVERY).filter((host) => !badHosts.includes(host))
    const results = await findHosts(hostSample)
    logger.debug(`Host Discovery Attempt# ${i + 1} ${JSON.stringify(results)}`)
    hostList = [...new Set([...hostList, ...results.success])]
    badHosts = [...new Set([...badHosts, ...results.failed])]
    if (hostCount === hostList.length || (targetCount && hostList.length >= targetCount)) {
      logger.debug(`Host Discovery Complete, found ${hostList.length} hosts, list: ${JSON.stringify(hostList)}`)
      return hostList
    }
    hostCount = hostList.length
  }
  logger.debug(`Host Discovery Complete, found ${hostList.length} hosts, list: ${JSON.stringify(hostList)}`)
  return hostList
}

module.exports = {
  discoverHosts
}

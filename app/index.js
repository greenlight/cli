#!/usr/bin/env node

const { red, bold } = require('chalk')
const { parse, discover } = require('@greenlight/config-loader')
const { Promise } = require('smart-promise')
const make = require('make-dir')

const { GREENLIGHT_TEMP } = require('./env')
const { end } = require('./logger')
const reporters = require('./reporters/')
const run = require('./run')

const builder = yargs => {
  yargs.positional('source', {
    type: 'string',
    description: 'source path to use'
  })

  yargs.options({
    config: {
      alias: 'c',
      type: 'strig',
      description: 'path to greenlight config file'
    },

    reporter: {
      alias: 'r',
      type: 'string',
      description: 'Use the specified output reporter',
      choices: ['text', 'json', 'html', 'silent'],
      default: 'text'
    },

    exit: {
      alias: 'e',
      type: 'boolean',
      default: false,
      description: 'soft exit(0) even if issues were found'
    }
  })
}

const handler = async argv => {
  // we don't set the default in yargs to keep the help output clean
  argv.source = argv.source || process.cwd()

  // attempt to read config
  const config = argv.config ? await parse(argv.config) : await discover(argv.source)

  // make temp dir
  await make(GREENLIGHT_TEMP)

  // loop through all plugins
  let plugins = Object.entries(config.plugins)

  // only select enabled plugins
  plugins = plugins.filter(([key, value]) => value === true || (typeof value === 'object' && value.enabled !== false))

  // run all plugins
  const results = await Promise.all(plugins.map(([name, settings]) => run(name, settings, argv.source)))

  // close the logger
  end()

  // run reporter
  reporters[argv.reporter].call(null, results)

  // if one plugin didn't run => exit(1)
  if (results.find(report => report.run === false)) {
    process.exit(1)
  }

  // no need to check for issues => exit(0)
  if (argv.exit) {
    process.exit(0)
  }

  // if one issue found => exit(1)
  process.exit(results.find(report => report.issues.length > 0) ? 1 : 0)
}

require('yargs') // eslint-disable-line no-unused-expressions
  .usage('$0 [source]', 'run analysis', builder, handler)
  .help()
  .fail((message, error, yargs) => {
    process.stderr.write(`Oops! ${red(error ? error.message : message)}\n\n${bold('Usage')}:\n\n`)
    yargs.showHelp()
    process.exit(1)
  })
  .argv

const instance_skel = require('../../instance_skel')
const xml2js = require('xml2js')

class instance extends instance_skel {
	/**
	 * Create an instance of the module
	 *
	 * @param {EventEmitter} system - the brains of the operation
	 * @param {string} id - the instance ID
	 * @param {Object} config - saved user configuration parameters
	 * @since 1.0.0
	 */
	constructor(system, id, config) {
		super(system, id, config)

		// Custom Variables Handling
		this.customVariables = {}
		system.emit('custom_variables_get', this.updateCustomVariables)
		system.on('custom_variables_update', this.updateCustomVariables)

		this.actions() // export actions
	}

	updateCustomVariables = (variables) => {
		this.customVariables = variables
		this.actions()
	}

	updateConfig(config) {
		this.config = config
		this.init_adder()
	}

	init() {
		this.init_adder()
		this.status(this.STATE_OK)
	}

	init_adder() {
		this.host = (this.config.https ? 'https://' : 'http://') + this.config.aim_ip + '/api'
		// login to get auth token
		let url = this.host + '?v=1&method=login'
		this.system.emit('rest_get', url, (err, result) => {
			if (err !== null) {
				this.log('error', err)
				this.status(this.STATUS_ERROR, result.error.code)
			} else {
				try {
					let xml = result.data.toString()
					this.debug('Adder response:', xml)
					let self = this
					xml2js.parseString(xml, function(e, result) {						
						if (result.api_response.token != undefined) {
							self.auth_token = result.api_response.token[0]
							self.debug('Logged in using token:', self.auth_token)
						}
					})
				}
				catch(error) {
					this.debug(error)
					this.status(this.STATUS_ERROR)
				}
				// get channels
				let url = this.host + `?v=2&method=get_channels&token=${this.auth_token}`
				this.system.emit('rest_get', url, (err, result) => {
					if (err !== null) {
						this.log('error', err)
						this.status(this.STATUS_ERROR, result.error.code)
					} else {
						let xml = result.data.toString()
						//this.debug('Adder response:', xml)
						let self = this
						this.channels = []
						xml2js.parseString(xml, function(e, result) {
							result.api_response.channels[0].channel.forEach((chan, idx) => {
								self.channels.push({id: chan.c_id[0], label: chan.c_name[0]})
							})
							self.actions() // rebuild names list
						})
					}				
				})

				// get receivers
				url = this.host + `?v=2&method=get_devices&device_type=rx&token=${this.auth_token}`
				this.system.emit('rest_get', url, (err, result) => {
					if (err !== null) {
						this.log('error', err)
						this.status(this.STATUS_ERROR, result.error.code)
					} else {
						let xml = result.data.toString()
						//this.debug('Adder response:', xml)
						let self = this
						this.receivers = []
						xml2js.parseString(xml, function(e, result) {
							result.api_response.devices[0].device.forEach((rx, idx) => {
								self.receivers.push({id: rx.d_id[0], label: rx.d_name[0]})
							})
							self.actions() // rebuild names list
						})
					}				
				})

			}
		})

	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'textinput',
				id: 'aim_ip',
				label: 'AIM server IP',
				width: 12,
			},
			{
				type: 'checkbox',
				label: 'HTTPS Connection',
				id: 'https',
				default: false
			},
			{
				type: 'dropdown',
				id: 'rejectUnauthorized',
				label: 'Unauthorized Certificates',
				width: 6,
				default: true,
				choices: [
					{ id: true, label: 'Reject' },
					{ id: false, label: 'Accept - Use at your own risk!' },
				],
			},
			{
				type: 'text',
				id: 'authentication_text',
				width: 12,
				label: 'Information',
				value: 'Leave username and password blank for default user'
			},
			{
				type: 'textinput',
				id: 'username',
				label: 'AIM username',
				width: 12,
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'AIM password',
				width: 12,
			},
			
		]
	}

	// When module gets deleted
	destroy() {
		this.debug('destroy')
		this.system.removeListener('custom_variables_update', this.updateCustomVariables)
	}

	actions() {
		// console.log('line 163', this.channels)
		// console.log('line 164', this.receivers)
		this.setActions({
			connectChannel: {
				label: 'Connect Channel',
				options: [
					{
						type: 'dropdown',
						id: 'chan',
						label: 'Channel:',
						width: 6,
						required: true,
						choices: this.channels,
					},
					{
						type: 'dropdown',
						id: 'rx',
						label: 'Receiver:',
						width: 6,
						required: true,
						choices: this.receivers,
					},
					{
						type: 'dropdown',
						id: 'mode',
						label: 'Mode:',
						width: 6,
						required: true,
						default: 's',
						choices: [
							{id: 'v', label: 'video only'},
							{id: 's', label: 'shared'},
							{id: 'e', label: 'exclusive'},
							{id: 'p', label: 'private'},
						]
					},
				]
			}
		})
	}

	action(action) {
		let cmd
		
		switch (action.action) {
			case 'connectChannel':
				// login to get auth token
				let url = this.host + '?v=1&method=login'
				this.system.emit('rest_get', url, (err, result) => {
					if (err !== null) {
						this.log('error', err)
						this.status(this.STATUS_ERROR, result.error.code)
					} else {
						try {
							let xml = result.data.toString()
							this.debug('Adder response:', xml)
							let self = this
							xml2js.parseString(xml, function(e, result) {						
								if (result.api_response.token != undefined) {
									self.auth_token = result.api_response.token[0]
									self.debug('Logged in using token:', self.auth_token)
								}
							})
						}
						catch(error) {
							this.debug(error)
							this.status(this.STATUS_ERROR)
						}

						// disconnect channel first
						cmd = `${this.host}?v=5&method=disconnect_channel&token=${this.auth_token}&rx_id=${action.options.rx}&force=1`
						this.debug(`Disconnecting receiver ${action.options.rx}`)
						this.system.emit('rest_get', cmd, (err, result) => {
							if (err !== null) {
								this.log('error', err)
								this.status(this.STATUS_ERROR, result.error.code)
							} else {
								let xml = result.data.toString()
								this.debug('Adder response:', xml)
								let self = this
								xml2js.parseString(xml, function(e, result) {
									self.debug(result)
								})

								// connect channel
								cmd = `${this.host}?v=5&method=connect_channel&token=${this.auth_token}&c_id=${action.options.chan}&rx_id=${action.options.rx}&mode=${action.options.mode}`
								this.debug(`Connecting receiver ${action.options.rx} to ${action.options.chan}`)
								this.system.emit('rest_get', cmd, (err, result) => {
									if (err !== null) {
										this.log('error', err)
										this.status(this.STATUS_ERROR, result.error.code)
									} else {
										let xml = result.data.toString()
										this.debug('Adder response:', xml)
										let self = this
										xml2js.parseString(xml, function(e, result) {
											self.debug(result)
										})
									}				
								})
							}				
						})
					}
				})

				break
		}
	}
}
exports = module.exports = instance

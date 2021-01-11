<template>
  <div class="cli">
    <textarea readonly :rows="outputRows" class="cli-log" v-model="log"
      spellcheck="false" ref="logarea"></textarea>

    <div class="cli-input">
      <div class="cli-shortcuts">
        <div v-for="(sc, idx) in shortcuts" :key="idx" class="shortcut" @click="inputShortcut(sc)">
          {{ sc.name }}<span class="shortcut-default" v-if="sc.val !== null && sc.val !== undefined">={{sc.val}}</span>
        </div>
      </div>

      <div class="cli-prompt">
        <div class="prompt">{{ prompt }}:</div>
        <input type="text" v-model="cli_input" @keypress.enter="submitInput"
          @keydown.prevent.up="nextHistoryItem" @keydown.prevent.down="prevHistoryItem"
          ref="cli" />
      </div>
    </div>
  </div>
</template>

<script>
import Vue from 'vue';

export default {
  data () {
    return {
      prompt: 'command',

      log: '',
      log_arr: [],

      cli_input: '',

      active_command: null,
      active_option: null,

      command_result: {},

      history: [], // first item = most recent
      history_cursor: 0
    };
  },
  props: {
    commands: {
      type: Array,
      default () {
        return [];
      }
    },
    promptWrite: {
      type: String,
      default: ''
    },
    promptAppend: {
      type: String,
      default: ''
    },
    outputPrint: {
      type: String,
      default: ''
    },
    outputRows: {
      type: Number,
      default: 6
    }
  },
  computed: {
    commands_obj () {
      const cmds = {};

      this.commands.forEach(cmd => {
        cmds[cmd.command] = cmd;
      });

      return cmds;
    },
    required_options () {
      return this.active_command.options
        ? this.active_command.options.filter(opt => opt.required)
        : [];
    },
    // does this command have all required options filled in?
    command_completed () {
      for (let i = 0; i < this.required_options.length; i++) {
        const opt = this.required_options[i];
        if (this.command_result[opt.name] === null) {
          return false;
        }
      }

      return true;
    },
    shortcuts () {
      const cancel = { name: 'cancel', val: null };

      if (this.active_option) {
        if (this.active_option.type === 'enum') {
          return this.active_option.opts.map(opt => {
            return { name: opt, val: null };
          }).concat([cancel]);
        }
        else if (this.active_option.type === 'boolean') {
          return [
            { name: 'true', val: null },
            { name: 'false', val: null },
            cancel
          ];
        }
        else {
          return [cancel];
        }
      }
      else if (this.active_command) {
        return Object.keys(this.command_result)
          .filter(key => key !== 'type').map(key => {
            const _val = this.command_result[key];
            const out = {
              name: key
            };

            if (Array.isArray(_val)) {
              out.val = _val.join(',');
            }
            else {
              out.val = _val;
            }

            return out;
          }).concat([cancel]);
      }
      else {
        return this.commands.map(com => {
          return {
            name: com.command,
            val: null
          };
        });
      }
    }
  },
  watch: {
    log_arr () {
      this.log = this.log_arr.join('\n');
    },
    promptWrite () {
      this.cli_input = this.promptWrite;
      this.submitInput();
    },
    promptAppend (txt) {
      this.cli_input += txt;
      this.$refs.cli.focus();
    },
    outputPrint () {
      if (this.outputPrint) {
        this.print(this.outputPrint);
      }
    }
  },
  methods: {
    inputShortcut (sc) {
      this.cli_input = sc.name;
      this.submitInput();
    },
    async nextHistoryItem () {
      this.cli_input = this.history[this.history_cursor];

      await Vue.nextTick();
      this.$refs.cli.setSelectionRange(this.cli_input.length, this.cli_input.length);

      this.history_cursor++;

      if (this.history_cursor === this.history.length) {
        this.history_cursor = this.history.length - 1;
      }
    },
    async prevHistoryItem () {
      this.cli_input = this.history[this.history_cursor];

      await Vue.nextTick();
      this.$refs.cli.setSelectionRange(this.cli_input.length, this.cli_input.length);

      this.history_cursor--;

      if (this.history_cursor < 0) {
        this.history_cursor = 0;
      }
    },
    async print (msg) {
      this.log_arr.push(msg);

      await Vue.nextTick();

      this.$refs.logarea.scrollTop = this.$refs.logarea.scrollHeight;
    },
    // force input of required options
    promptNextOption () {
      // console.log('promptNextOption');

      for (let i = 0; i < this.required_options.length; i++) {
        const opt = this.required_options[i];

        if (this.command_result[opt.name] === null) {
          this.enterOption(opt);
          return true;
        }
      }

      return false;
    },
    enterOption (opt) {
      // console.log('enterOption');
      this.active_option = opt;
      this.prompt = opt.prompt || opt.name;

      this.$emit('opt-start', opt.name, opt);

      if (opt.type === 'enum') {
        this.print(`Enter ${this.prompt} (possible values: ${opt.opts.join(', ')})`);
      }
      else {
        this.print(`Enter ${this.prompt}`);
      }
    },
    exitCommand (completed) {
      if (completed) {
        this.$emit('cmd-complete', this.active_command.command, this.command_result);
      }
      else {
        this.$emit('cmd-cancel', this.active_command.command);
        this.print(`${this.active_command.command} command canceled`);
      }

      this.active_command = null;
      this.active_option = null;
      this.prompt = 'command';
    },
    exitOption (completed = true) {
      if (completed) {
        this.$emit('opt-complete', this.active_option.name,
          this.command_result[this.active_option.name],
          this.command_result);

        // send out progress if it has all required elements
        if (this.command_completed) {
          this.$emit('cmd-progress', this.active_command.command,
            this.command_result);
        }
      }
      else {
        this.$emit('opt-cancel', this.active_option.name);
      }

      this.active_option = null;
      this.prompt = 'option';
    },
    enterCommand (cmd) {
      // console.log('enterCommand');
      this.active_command = cmd;

      this.$emit('cmd-start', this.active_command.command);

      // this.print('command opts: ' +
      //   this.active_command.options.map(opt => opt.name).join(', '));

      this.command_result = {
        type: this.active_command.command
      };

      // if no options specified for command, exit immediately
      if (!this.active_command.options.length) {
        return this.exitCommand(true);
      }

      // build default object
      this.active_command.options.forEach(opt => {
        const def = opt.default === undefined ? null : opt.default;
        this.$set(this.command_result, opt.name, def);
      });

      this.promptNextOption();
    },
    submitInput () {
      const input = this.cli_input.trim();
      this.cli_input = '';
      this.history_cursor = 0;

      if (input.length) {
        this.history.unshift(input);
        this.print('> ' + input);
      }
      
      //
      // parse as input to a command option
      //
      if (this.active_option) {
        // console.log('parse as option input');

        if (!input.length) return;

        if (input === 'cancel') {
          // if command has single option, exit command, otherwise, exit option
          if (this.active_command.options.length === 1) {
            return this.exitCommand(false);
          }
          else {
            return this.exitOption(false);
          }
        }

        const opt = this.active_option;

        // parse depending on option data type
        if (opt.type === 'string') {
          this.command_result[opt.name] = input;
        }
        else if (opt.type === 'number') {
          const num = parseFloat(input);
          if (Number.isNaN(num)) {
            this.print('error: must specify number');
            return;
          }

          this.command_result[opt.name] = num;
        }
        else if (opt.type === 'ref') {
          const ref = parseInt(input);
          if (Number.isNaN(ref) || ref < 0) {
            this.print('error: must specify numeric id >= 0');
            return;
          }

          this.command_result[opt.name] = ref;
        }
        else if (opt.type === 'array') {
          this.command_result[opt.name] = input.split(',').map(item => item.trim());
        }
        else if (opt.type === 'enum') {
          if (opt.opts.indexOf(input) === -1) {
            this.print('error: value not recognized');
            return;
          }

          this.command_result[opt.name] = input;
        }
        else if (opt.type === 'boolean') {
          const bool = input === 'true';
          this.command_result[opt.name] = bool;
        }
        else if (opt.type === 'point') {
          const coords = input.split(',').map(c => parseFloat(c.split()));

          if (Number.isNaN(coords[0]) || Number.isNaN(coords[1]) || coords.length !== 2) {
            this.print('error: unable to parse as point');
            return;
          }

          this.command_result[opt.name] = coords;
        }
        else if (opt.type === 'points') {
          if (!/((\d+(\.\d+)?),?(\d+(\.\d+)?) ?){2,}/.test(input.trim())) {
            return this.print('error: provide points in format a,b[ c,d e,f ...]');
          }
          this.command_result[opt.name] = input.trim().split(' ')
            .map(pair => pair.split(',').map(p => parseFloat(p)));
        }
        else {
          console.warn('RhinoCLI: cannot parse input; unrecognized option type');
        }

        // auto prompt next un-filled required option
        this.exitOption();
        const autoPrompted = this.promptNextOption();

        if (!autoPrompted) {
          // if only 1 option and it's required, immediately complete command
          if (this.active_command.options.length === 1 &&
            this.active_command.options[0].required) {
            return this.exitCommand(true);
          }

          this.print(`Specify additional ${this.active_command.command} options, or press enter when done`);
        }
      }
      //
      // parse as input to active command
      //
      else if (this.active_command) {
        // console.log('parse as command input');

        if (!input.length) {
          if (this.command_completed) {
            return this.exitCommand(true);
          }
          else {
            return this.print('error: missing values for required options');
          }
        }

        if (input === 'cancel') {
          this.exitCommand(false);
          return;
        }

        const opt = this.active_command.options.filter(opt => opt.name === input)[0];

        if (!opt) {
          this.print(`command option \`${input}\` not recognized`);
          return;
        }

        this.enterOption(opt);
      }
      //
      // parse as initial command entry
      //
      else {
        // console.log('parse as general input');

        if (input === 'help') {
          this.printHelp();
          return;
        }

        if (!input.length) return;

        const cmd = this.commands_obj[input];

        if (!cmd) {
          this.print('unrecognized command');
          return;
        }

        // set active command
        this.enterCommand(cmd);
      }

      this.$refs.cli.focus();
    },
    printHelp () {
      const cmds = this.commands.map(cmd => cmd.command).join(', ');
      this.print('available commands: ' + cmds);
    }
  },
  created () {

  },
  mounted () {
    // this.printHelp();
  },
  beforeDestroy () {

  },
  components: {}
};
</script>

<style lang="scss" scoped>
.cli {
  font-family: 'ApercuMono', monospace;
  font-size: 14px;
  font-variant-ligatures: no-common-ligatures;

  .cli-input {
    border-top: 1px solid #dcdcdc;
    display: flex;
    flex-direction: column;
    background-color: white;
  }

  .cli-shortcuts {
    padding: 5px 0 0 5px;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    min-height: 27px;

    .shortcut {
      border: 1px solid #dedede;
      padding: 3px 6px;
      border-radius: 5px;
      margin: 0 5px 5px 0;
      cursor: pointer;

      .shortcut-default {
        opacity: 0.4;
      }

      &:hover {
        border-color: #bababa;
      }
    }
  }

  .cli-prompt {
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .prompt {
    padding: 0 5px 5px 5px;
    font-weight: 500;
    padding-right: 0;
    flex-shrink: 0;
  }

  textarea {
    font-family: inherit;
    background-color: #efefef;
    resize: none;
    padding: 5px;
  }

  textarea, input {
    width: 100%;
    border: none;
    font-size: inherit;

    &:focus {
      outline: none;
    }
  }

  input {
    font-family: inherit;
    padding: 0 5px 5px 5px;
  }
}
</style>

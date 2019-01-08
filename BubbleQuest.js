/*:
 *
 * @author Poltergasm
 * @plugindesc Shitty ABS for traditional styled RPGs
 *
 * @param Enemy Bubbled Sound
 * @desc The SE that plays when an enemy has been bubbled
 * @default Attack3
 * @type file
 * @dir audio/se
 * @require 1
 *
 * @param Zoom
 * @desc If you have a plugin that zooms, enter the value here (TODO)
 * @default 1.0
 *
 * @param Collect Bubble Sound
 * @desc The SE that plays when you collect a jailed enemy
 * @default Attack3
 * @type file
 * @dir audio/se
 * @require 1
 *
 * @param Door Open Sound
 * @desc The SE that plays when you defeat all enemies in a room that contains a door
 * @default Door1
 * @type file
 * @dir audio/se
 * @require 1
 *
 * @param Ice Magic
 * @desc Ice Magic Parameters
 * @default
 *
 * @param Ice Magic Spritesheet
 * @desc The spritesheet to use for frozen enemies
 * @default !Crystal
 * @type file
 * @dir img/characters
 * @require 1
 * @parent Ice Magic
 *
 * @param Ice Magic Index
 * @desc The image index to use inside the spritesheet
 * @default 3
 * @type number
 * @parent Ice Magic
 *
 */
(function($) {
    var $_Params = PluginManager.parameters('BubbleQuest');
    var $_Alias = {
        sceneBoot: DataManager.createGameObjects,
        gameEvent_init: Game_Event.prototype.initialize,
        gameEvent_update: Game_Event.prototype.update,
        gamePlayer_initMembers: Game_Player.prototype.initMembers,
        bitmap_init: Bitmap.prototype.initialize,
        sceneMap_start: Scene_Map.prototype.start,
        sceneMap_update: Scene_Map.prototype.update
    };
    var $_Actor = function() { return $gameActors.actor(1); };
    var $_Enemy = function(id) { return $dataEnemies[id] || false; };
    var $_Event = function(id) { return $dataMap.events[id] || false; };
    var $_Tool = function(id) { return $dataWeapons[id]; };
    var $_Bubbles = [];
    var $_Collected = 0;

    var $_ShootBubble = function(obj) {
        var bitmap = ImageManager.loadPicture('bubble');
        var sprite = new Sprite(bitmap);
        sprite.x = $gamePlayer.x*48;
        sprite.y = $gamePlayer.y*48;
        sprite._direction = $gamePlayer._direction;
        sprite._updated = new Date();
        sprite._travelTime = 0;
        sprite.ehit = false;
        sprite.opacity = 120;
        obj.addChild(sprite);
        $_Bubbles.push(sprite);
    };

    var $_EventInFrontOfPlayer = function() {
        var eid;
        switch(Number($gamePlayer._direction)) {
            case 2:
                e_id = $gameMap.eventIdXy($gamePlayer.x, $gamePlayer.y+1);
                break;
            case 6:
                e_id = $gameMap.eventIdXy($gamePlayer.x+1, $gamePlayer.y); 
                break;
            case 8:
                e_id = $gameMap.eventIdXy($gamePlayer.x, $gamePlayer.y-1);
                break;
            case 4:
                e_id = $gameMap.eventIdXy($gamePlayer.x-1, $gamePlayer.y); 
                break;
        }

        var evt = $_Event(e_id);
        return evt || false;
    };

    var $_EnemyInFrontOfPlayer = function() {
        var evt = $_EventInFrontOfPlayer();
        if (evt && evt.meta.enemy) {
            if (evt.obj !== 'undefined') {
                return evt;
            }
        }

        return false;
    }

    Bitmap.prototype.initialize = function(width, height) {
        $_Alias.bitmap_init.call(this, width, height);

        this.outlineColor = 'rgba(0, 0, 0, 1)';
    };

    Game_Player.prototype.initMembers = function() {
        $_Alias.gamePlayer_initMembers.call(this);

        this._currentSkill = 0;
        this._toolId = $_Actor()._skills[this._currentSkill];
        this._immunity = 60;
    };

    Game_Event.prototype.initialize = function(mapId, eventId) {
        $_Alias.gameEvent_init.call(this, mapId, eventId);

        if (this.isEnemy()) {
            this._enemyId = Number($_Event(this._eventId).meta.enemy);

            var _enemy = $_Enemy(this._enemyId);
            this._enemyHp = _enemy.params[0];
            this._enemyMp = _enemy.params[1];
            this._enemyAlive = true;
            this._enemyTouching = 0;
            this._canFreeze = _enemy.meta.canFreeze ? true : false;
            this._skillId = _enemy.actions[0].skillId;
            this._jailed = -1;

            if (_enemy.meta.prop)
                this._prop = true;

            $_Event(this._eventId).obj = this;
        }
    };

    Game_Event.prototype.isEnemy = function() {
        return $_Event(this._eventId).meta.enemy;
    };

    Game_Event.prototype.isDoor = function() {
        return $_Event(this._eventId).meta.door || false;
    };

    Game_Event.prototype.isButton = function() {
        return $_Event(this._eventId).meta.button;
    };

    Game_Event.prototype.update = function() {
        $_Alias.gameEvent_update.call(this);

        this.updateAction();
        if (this.isButton() && !this.pressed) {
            var _evt = $gameMap.eventIdXy(this._x, this._y);
            if (_evt && _evt != this._eventId) {
                var _e = $_Event(_evt);
                if (_e.obj._isFrozen) {
                    var _mapId = $gameMap._mapId;
                    $gameSelfSwitches.setValue([_mapId, this._eventId, 'A'], true);
                    this.pressed = true;
                }
            }
        }

        $_Event(this._eventId).obj = this;
    };

    Game_Event.prototype.updateAction = function() {
        var door_num = this.isDoor();
        if (door_num) {
            if ($_Collected === Number(door_num)) {
                if ($_Event(this._eventId).pages.length > 1) {
                    $_Event(this._eventId).meta = {};
                    var _mapId = $gameMap._mapId;
                    $gameSelfSwitches.setValue([_mapId, this._eventId, 'A'], true);

                } else {
                    $gameMap.eraseEvent(this._eventId);
                    this.erase();
                }
                AudioManager.playSe({
                    name: $_Params['Door Open Sound'],
                    pan: 0,
                    pitch: 100,
                    volume: 60
                });
            }
        }
        
        if (this.isEnemy()) {
            if (this._enemyAlive) {
                if ($_Bubbles.length > 0) {
                    var bub = $_Bubbles[0];
                    var bx = bub.x,
                        by = bub.y,
                        bh = 48,
                        bw = 48;
                    var ex = this.x*48,
                        ey = this.y*48,
                        eh = 48,
                        ew = 48;

                    if (ex < bx + bw &&
                        ex + ew > bx &&
                        ey < by + bh &&
                        ey + eh > by)
                    {
                        $_Bubbles[0].ehit = this._eventId;
                    }
                }

                var sx = Math.abs(this.deltaXFrom($gamePlayer.x));
                var sy = Math.abs(this.deltaYFrom($gamePlayer.y));
                if ((sx + sy) == 1) {
                    this._enemyTouching += 1;
                    if (this._jailed > -1 && !this._collected) {
                        AudioManager.playSe({
                            name: $_Params['Collect Bubble Sound'],
                            pan: 0,
                            pitch: 100,
                            volume: 60
                        });
                        $gameActors.actor(1).gainMp(5);
                        $_Bubbles[this._jailed]._remove = true;
                        this._collected = true;
                        this._enemyAlive = false;
                        if ($_Event(this._eventId).pages.length > 1) {
                            $_Event(this._eventId).meta = {};
                            var _mapId = $gameMap._mapId;
                            $gameSelfSwitches.setValue([_mapId, this._eventId, 'A'], true);

                        } else {
                            $gameMap.eraseEvent(this._eventId);
                            this.erase();
                        }

                        // param??
                        //this.requestAnimation(127);
                    } else {
                        if (this._isFrozen) {
                            if (this._enemyTouching >= 40) {
                                this.turnTowardPlayer();
                                this.moveBackward();
                            }
                        } else {
                            if (this._enemyTouching >= 20 && this._jailed === -1 && Number($gamePlayer._immunity) >= 60 && !this._prop) {
                                var animId = $dataSkills[$_Event(this._eventId).obj._skillId].animationId;
                                $gamePlayer.requestAnimation(animId);
                                $gamePlayer.moveBackward();
                                $gamePlayer.moveBackward();
                                $gameActors.actor(1).gainHp(-50);
                                $gamePlayer._immunity = 0;
                            }
                        }
                    }
                } else {
                    this._enemyTouching = 0;
                }
            }
        }
    };

    Scene_Map.prototype.start = function() {
        $_Alias.sceneMap_start.call(this);

        this._healthBar = new HUD(100,100);
        this._skillBox  = new SkillBox(400, 5);
        this.addWindow(this._healthBar);
        this.addWindow(this._skillBox);
        $_Bubbles = [];
        $_Collected = 0;
    };

    function _shootFireball(_skill) {
        var _eid = -1;
        var _success = false;
        for (var i = 0; i < 5; i++) {
            switch(Number($gamePlayer._direction)) {
                case 2:
                    // down
                    _eid = $gameMap.eventIdXy($gamePlayer.x, $gamePlayer.y+i);
                    break;
                case 6:
                    // right
                    _eid = $gameMap.eventIdXy($gamePlayer.x+i, $gamePlayer.y); 
                    break;
                case 8:
                    // up
                    _eid = $gameMap.eventIdXy($gamePlayer.x, $gamePlayer.y-i);
                    break;
                case 4:
                    // left
                    _eid = $gameMap.eventIdXy($gamePlayer.x-i, $gamePlayer.y); 
                    break;
            }
            
            if (_eid > 0) {
               var _ev = $dataMap.events[_eid];
               if (_ev.meta.enemy) {
                    if (_ev.obj !== 'undefined' && _ev.obj._enemyAlive) {
                        _ev.obj.requestAnimation(_skill.animationId);
                        _ev.obj._enemyHp -= 100;
                        _success = true;
                    }
                }
            }
        }

        return _success;
    }

    Scene_Map.prototype.update = function() {
        $_Alias.sceneMap_update.call(this);

        if ($gamePlayer._immunity < 60) $gamePlayer._immunity += 1;
        if (Input.isTriggered('ok') && $_Bubbles.length < 1) {
            var evt = $_EventInFrontOfPlayer();
            if (!evt || evt.meta.enemy) $_ShootBubble(this);
        }

        for (var i = 0; i < $_Bubbles.length; i++) {
            var _b = $_Bubbles[i];
            if (_b._remove) {
                this.removeChild($_Bubbles[i]);
                $_Bubbles.splice(i, 1);
                continue;
            }
            if (_b.x > 816 || _b.x < 0 || _b.y < 0 || _b.y > 624) {
                this.removeChild(_b);
                $_Bubbles.splice(i, 1);
            } else {
                var ev_id = $gameMap.eventIdXy(_b.x/48, _b.y/48);
                var evt = $_Event(ev_id);
                //if (evt && (evt.meta.enemy && evt.obj._jailed <= -1)) {
                if (_b.ehit) {
                    var evt = $_Event(_b.ehit);
                    if (evt.obj._jailed <= -1) {
                        var _toolId = $_Actor()._equips[0]._itemId;
                        var _dmg = $_Tool(_toolId).params[2];
                        evt.obj._enemyHp -= _dmg;
                        if (evt.obj._enemyHp <= 0) {
                            _b.x = evt.obj._x*48;
                            _b.y = evt.obj._y*48;
                            evt.obj.setDirection(2);
                            evt.obj._locked = true;
                            evt.obj._jailed = i
                            _b.jailed = true;
                            AudioManager.playSe({
                                name: $_Params['Enemy Bubbled Sound'],
                                pan: 0,
                                pitch: 100,
                                volume: 90
                            });
                            $_Collected += 1;
                        } else {
                            var _toolId = $_Actor()._equips[0]._itemId;
                            evt.obj.requestAnimation($_Tool(_toolId).animationId);
                            evt.obj.turnTowardPlayer();
                            evt.obj.setMoveSpeed(6);
                            evt.obj.moveBackward();
                            evt.obj.setMoveSpeed(4);
                            _b._remove = true;
                        }
                    }
                    _b.ehit = false;
                } else {
                    if (_b.jailed) { continue; }
                    //var curDate = new Date();
                    //_b._updated.setSeconds(_b._updated.getSeconds()+1);
                    //if (curDate.getTime() > _b._updated.getTime()+100) {
                        switch(_b._direction) {
                            case 2:
                                _b.y += 4;
                                break;
                            case 6:
                                _b.x += 4;
                                break;
                            case 8:
                                _b.y -= 4;
                                break;
                            case 4:
                                _b.x -= 4;
                                break;
                        }
                        _b._travelTime += 1;
                        if (_b._travelTime > 36) { _b._remove = true; }
                        //_b._updated = curDate;
                    }
                //}
            }
        }

        if (Input.isTriggered('shift')) {
            var _skill = $dataSkills[$gamePlayer._skillId];
            
            if (_skill && _skill.meta) {
                var _cost = Number(_skill.mpCost);
                if ($_Actor()._mp >= _cost) {
                    if (_skill.meta.heal) {
                        $_Actor().gainHp(Number(_skill.meta.heal));
                        $_Actor().gainMp(-_cost);
                        $gamePlayer.requestAnimation(_skill.animationId);

                    } else if (_skill.meta.fireball) {
                        if (_shootFireball(_skill))
                            $_Actor().gainMp(-_cost);

                    } else if (_skill.meta.ice) {
                        var _ev = $_EnemyInFrontOfPlayer();
                        if (_ev && _ev.obj._enemyAlive) {
                            if (_ev.obj._canFreeze) {
                                _ev.obj._isFrozen = true;
                                _ev.obj.requestAnimation(_skill.animationId);
                                _ev.obj._locked = true;
                                _ev.obj.setImage(
                                    $_Params['Ice Magic Spritesheet'],
                                    Number($_Params['Ice Magic Index'])
                                );
                            } else {
                                _ev.obj.setMoveSpeed(6);
                                _ev.obj.requestAnimation(_skill.animationId);
                                _ev.obj.turnTowardPlayer();
                                _ev.obj.moveBackward();
                                _ev.obj.setMoveSpeed(4);
                            }

                            $_Actor().gainMp(-_cost);
                        }
                    }
                }
            }
        }

        // cycle through skills
        if (Input.isTriggered('pagedown')) {
            var _len = $_Actor()._skills.length-1;
            if ($gamePlayer._currentSkill+1 > _len) {
                $gamePlayer._currentSkill = 0;
            } else {
                $gamePlayer._currentSkill += 1;
            }

            $gamePlayer._skillId = $_Actor()._skills[$gamePlayer._currentSkill];
        } else if (Input.isTriggered('pageup')) {
            if ($gamePlayer._currentSkill-1 >= 0) {
                $gamePlayer._currentSkill -= 1;
                $gamePlayer._skillId = $_Actor()._skills[$gamePlayer._currentSkill];
            }
        }

        this._healthBar.refresh();
        this._skillBox.refresh();
    };

    function HUD() {
        this.initialize.apply(this, arguments);
    }

    function SkillBox() {
        this.initialize.apply(this, arguments);
    }

    // HUD

    SkillBox.prototype = Object.create(Window_Base.prototype);
    SkillBox.prototype.constructor = SkillBox;
    HUD.prototype = Object.create(Window_Base.prototype);
    HUD.prototype.constructor = HUD;


    SkillBox.prototype.initialize = function(x, y) {
        Window_Base.prototype.initialize.call(this, x, y, this.windowWidth(), this.windowHeight());
        this.refresh();
    };

    HUD.prototype.initialize = function(x, y) {
        Window_Base.prototype.initialize.call(this, 0, 0, this.windowWidth(), this.windowHeight());
        this._value = -1;
        this.refresh();
        this.opacity = 0;
    };

    SkillBox.prototype.refresh = function() {
        this.contents.clear();
        if ($gamePlayer && $gamePlayer._skillId) {
            if ($dataSkills[$gamePlayer._skillId]) {
                this.drawIcon($dataSkills[$gamePlayer._skillId].iconIndex, 2, 2);
            }
        }
    };

    HUD.prototype.refresh = function() {
        this.contents.clear();
        
        this.drawActorHp($gameParty.leader(), 0, 0, 200);
        this.drawActorMp($gameParty.leader(), 0, 48, 200);
        //this.drawText("Skill: ", 0, 96, 100)
    };

    SkillBox.prototype.windowWidth = function() { return 75; };
    SkillBox.prototype.windowHeight = function() { return 75; };
    HUD.prototype.windowWidth = function() { return 240; };
    HUD.prototype.windowHeight = function() { return 240; };
})();




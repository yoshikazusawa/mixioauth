// TODO: handling stateChanged, handling errors
TiMixi = {};
TiMixi.requestToken = function(param, onLoad, onError) {
    var client = Titanium.Network.createHTTPClient();
    client.open('POST', 'https://secure.mixi-platform.com/2/token');
    client.setRequestHeader("Content-Type",   "application/x-www-form-urlencoded");
    client.onload = function() {
        onLoad(JSON.parse(this.responseText));
    };
    client.onerror = function(error) {
        onError(this.responseText);
    };
    client.send(param);
};

var createAuthorizer = TiMixi.createAuthorizer = function() {
    
    var settings = TiMixi.Util.readJSONFile('settings.json');
    var accessToken ;
    var refreshToken;
    var dueTime     ;
    
    var isInitialized = function() {
        return (accessToken && refreshToken && dueTime);
    };
    
    var hasExpired = function() {
        return (Date.now() >= (dueTime - 20)); // 20: padded time
    };
    
    var getAuthCode = function(onAuthorize, onError) {
        var authWindow = win1; // TODO: changed currentWindow
        var url = "https://mixi.jp/connect_authorize.pl?" + TiMixi.Util.toQueryString({
            client_id    : settings.consumerKey,
            scope        : settings.scope,
            response_type: 'code'
        });
        var authView = Ti.UI.createWebView({ url: url });
        authView.addEventListener('load', function(evt) {
            var matched = /[\?&]code=(\w+)/.exec(evt.url);
            if (matched) {
                onAuthorize(matched[1]);
                authWindow.remove(authView);
            } 
            else {
                //onError('authentication failed');
            }
        });
        authWindow.add(authView);
    };
    
    var getToken = function(authCode, onGetToken, onError) {
        var param  = {
            grant_type   : 'authorization_code', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            redirect_uri : settings.redirectUri,
            code         : authCode
        };
        TiMixi.requestToken(param, onGetToken, onError);
    };
    
    var updateToken = function(onGetToken, onError) {
        var param  = {
            grant_type   : 'refresh_token', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            refresh_token: refreshToken
        };
        TiMixi.requestToken(param, onGetToken, onError);
    };
    
    var setTokenData = function(json) {
        accessToken  = json.access_token;
        refreshToken = json.refresh_token;
        dueTime      = parseInt(json.expiresIn) + Date.now();
    };
    
    return function authorize(onFinish, onError) {
        
        var onTakeToken = function(json) {
            setTokenData(json);
            onFinish(accessToken);
        };
        
        if (!isInitialized()) {
            getAuthCode(function(authCode) {
                getToken(authCode, onTakeToken, onError);
            }, onError);
        } else if (hasExpired()){
            updateToken(onTakeToken, onError);
        } else {
            onFinish(accessToken);
        }
    };
};

TiMixi.Util = (function(){
    var toArray = function(list) { return Array.prototype.slice.call(list); };
    var each  = function(obj, iterator) {
        for (var key in obj)
            if (obj.hasOwnProperty(key)) iterator(key, obj[key]);
    };
    var keys = function(obj) {
        var keys = [];
        each(obj, function(key){ keys.push(key); });
        return keys;
    };
    var bind = function(func, context) {
        return function() {
            func.apply(context, toArray(arguments));
        };
    };
    
    var headerOf = {
        form : 'application/x-www-form-urlencoded',
        multi: 'multipart/form-data',
        json : 'application/json',
        jpeg : 'image/jpeg',
        png  : 'image/png'
    };
    var callApi = function(method, uri, type, param, onSuccess, onError) {
        TiMixi.createAuthorizer()(function(accessToken) {
            var client = Titanium.Network.createHTTPClient();
            client.open(method, uri);
            client.setRequestHeader('Authorization',   'OAuth ' + accessToken);
            if (type !== null) 
                client.setRequestHeader('Content-type', headerOf[type]);
            client.onload = function() {
                onSuccess(JSON.parse(this.responseText));
            };
            client.onerror = onError;
            client.send(param);
        }, onError);
    };
    
    var isString = function(obj) {
        return !!(obj === '' || (obj && obj.charCodeAt && obj.substr));
    };
    var isNumber = function(obj) {
        return !!(obj === 0 || (obj && obj.toExponential && obj.toFixed));
    };
    var split = function(args) {
        var i = 0;
        while (isString(args[i]) || isNumber(args[i])) ++i;
        return [
            args.slice(0, i),
            args.slice(i)
        ];
    };
    
    var pattern = /^(post|get|delete|put)/;
    var callMap = function(obj) {
        return keys(obj).reduce(function(result, key) {
            result[key] = function() {
                var method   = pattern.exec(key)[1].toUpperCase();
                var splitted = split(toArray(arguments));
                callApi.apply(null, 
                    [method]
                    .concat(obj[key].apply(null, splitted[0]))
                    .concat(splitted[1])
                );
            };
            return result;
        }, {});
    };
    
    var encode = encodeURIComponent;
    var toQueryString = function(obj) {
        return keys(obj).reduce(function(results, key) {
            results.push(encode(key) + '=' + encode(obj[key]));
            return results;
        }, []).join('&');
    };
    var readJSONFile = function(fileName) {
        return JSON.parse(
            Titanium.Filesystem.getFile(
                Titanium.Filesystem.resourcesDirectory, 
                fileName
            ).read().text
        );
    };
    return {
        each   : each,
        bind   : bind,
        callApi: callApi,
        callMap: callMap,
        toQueryString: toQueryString,
        readJSONFile: readJSONFile
    };
})();


TiMixi.Voice = (function() {
    var base    = 'http://api.mixi-platform.com/2/voice';
    var build   = function() { 
        return [base].concat(Array.prototype.slice.call(arguments)).join('/'); 
    };

    return TiMixi.Util.callMap({
        getUserTimeline: function(userId) {
            var uri = build('statuses/[User-ID]/user_timeline'.replace('[User-ID]', userId));
            return [uri, null];
        },
        getFriendsTimeline: function(groupId) {
            var group = groupId ? '/' + groupId : '';
            var uri   = build('statuses/friends_timeline', group);
            return [uri, null];
        },
        getStatus: function(postId) {
            var uri = build('statuses/show', postId);
            return [uri, null];
        },
        getReplies: function(postId) {
            var uri = build('replies/show', postId);
            return [uri, null];
        },
        getFavorites: function(postId) {
            var uri = build('favorites/show', postId);
            return [uri, null];
        },
        postStatus: function() {
            var uri = build('statuses/update');
            return [uri, 'form'];
        },
        postReply: function(postId) {
            var uri = build('replies/update', postId);
            return [uri, 'form'];
        },
        postFavorite: function(postId) {
            var uri = build('favorites/create', postId);
            return [uri, null];
        },
        deleteStatus: function(postId) {
            var uri = build('statuses/destroy');
            return [uri, null];
        },
        deleteReply: function(postId, commentId) {
            var uri = build('replies/destroy', postId, commentId);
            return [uri, null];
        },
        deleteFavorite: function(postId, userId) {
            var uri = build('favorites/destroy', postid, commentId);
            return [uri, null];
        }
    });
})();

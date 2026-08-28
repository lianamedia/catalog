var _agent_ = {};
(function ($) {
  var sUserAgent = navigator.userAgent.toLowerCase();
  //mac safari "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.2 Safari/605.1.15"

  $.browser = new Object();

  $.browser.webkit = /webkit/.test(sUserAgent);
  $.browser.mozilla = /firefox/.test(sUserAgent);

  $.browser.firefox = $.browser.mozilla;
  $.browser.msie = /msie/.test(sUserAgent) || /trident/.test(sUserAgent) || /edge/.test(sUserAgent);
  $.browser.edge = /edge/.test(sUserAgent);

  $.browser.opera = /opera/.test(sUserAgent) || /opr/.test(sUserAgent);
  $.browser.chrome = /chrome/.test(sUserAgent) && !$.browser.opera && !$.browser.edge;
  $.browser.uc = /ucbrowser/.test(sUserAgent);
  $.browser.safari =
    /safari/.test(sUserAgent) && !$.browser.chrome && !$.browser.uc && !$.browser.opera;

  $.browser.wechat = /micromessenger/.test(sUserAgent);
  $.browser.dingding = /dingtalk/.test(sUserAgent);

  ($.browser.version = 0);

  function getVersionCode(oReg) {
    var aResult = sUserAgent.match(oReg);
    if (aResult == null || aResult.length == 0) return 0;

    var sResult = aResult[0],
      iIndex = sResult.indexOf('/'),
      sVersion = sResult.substring(iIndex + 1, sResult.length);

    if (sVersion == '') return 0;
    return parseInt(sVersion);
  }

  if ($.browser.firefox) $.browser.version = getVersionCode(/firefox\/\d+/);

  if ($.browser.msie) {
    var aIEWithVersion = sUserAgent.match(/msie\s?\d+\.0/);
    if (aIEWithVersion == null) {
      aIEWithVersion = sUserAgent.match(/trident\/\d+\.0/);
      if (aIEWithVersion != null && aIEWithVersion.length > 0) {
        var sTridentWithVersion = aIEWithVersion[0];
        var iVersion = parseInt(sTridentWithVersion.replace('trident/', ''));

        $.browser.version = iVersion + 4;
      } else {
        // edge/12.000
        aIEWithVersion = sUserAgent.match(/edge\/\d+\.0/);
        if (aIEWithVersion != null && aIEWithVersion.length > 0) {
          var sTridentWithVersion = aIEWithVersion[0];
          var iVersion = parseInt(sTridentWithVersion.replace('edge/', ''));

          $.browser.version = iVersion;
        }
      }
    } else {
      var sIEWithVersion = aIEWithVersion[0];
      var iVersion = parseInt(sIEWithVersion.replace('msie', ''));
      $.browser.version = iVersion;
    }
  }

  if ($.browser.opera)
    $.browser.version = getVersionCode(/opera\/\d+/) || getVersionCode(/opr\/\d+/);
  if ($.browser.chrome) $.browser.version = getVersionCode(/chrome\/\d+/);
  if ($.browser.uc) $.browser.version = getVersionCode(/ucbrowser\/\d+/);
  if ($.browser.safari) $.browser.version = getVersionCode(/safari\/\d+/);

  //device
  if ($.browser.device == undefined) {
    ($.browser.DEVICE_PC = 0), ($.browser.DEVICE_PAD = 1), ($.browser.DEVICE_PHONE = 2);
    var isPad = /pad/.test(sUserAgent) || /ipod/.test(sUserAgent),
      isIPhone = /iphone/.test(sUserAgent),
      isWinPhone = /wpdesktop/.test(sUserAgent) || /windows phone/.test(sUserAgent),
      isBlackBerry = /blackberry/.test(sUserAgent),
      isMobile = /mobile/.test(sUserAgent) || /phone/.test(sUserAgent),
      isOppo = /heytapbrowser/.test(sUserAgent);

    if (sUserAgent.indexOf('macintosh') > -1) {
      isPad = true;
      try {
        document.createEvent('TouchEvent');
      } catch (e) {
        isPad = false;
      }
    }

    $.browser.device = $.browser.DEVICE_PC;
    if (isPad) {
      $.browser.device = $.browser.DEVICE_PAD;
    } else {
      if (isIPhone || isWinPhone || isBlackBerry || isMobile || isOppo)
        $.browser.device = $.browser.DEVICE_PHONE;
    }
  }

  //is app
  if ($.browser.app == undefined) {
    $.browser.app = /android-app/.test(sUserAgent);
  }

  //prefix
  if ($.browser.prefix == undefined) {
    $.browser.prefix = '';
    if ($.browser.webkit == true) $.browser.prefix = '-webkit-';
    if ($.browser.mozilla == true) $.browser.prefix = '-moz-';
    //if($.browser.opera == true) $.browser.prefix = "-o-";
    if ($.browser.opera == true) $.browser.prefix = '-webkit-';
    if ($.browser.uc == true) $.browser.prefix = '-webkit-';
    if ($.browser.msie == true) $.browser.prefix = '-ms-';
  }

  //system
  function getSystemVersionCode(oReg) {
    var aResult = sUserAgent.match(oReg);
    if (aResult == null || aResult.length == 0) return 0;

    var sResult = aResult[0].replace('_', '.');
    aResult = sResult.match(/\d+\.?\d?/);
    if (aResult == null || aResult.length == 0) return 0;
    var sVersion = aResult[0];
    if (sVersion == '') return 0;

    return parseFloat(sVersion);
  }

  if ($.system == undefined) {
    $.system = { name: '', version: 0 };

    ($.system.WINDOWS = 'Windows'),
      ($.system.WP = 'WinPhone'),
      ($.system.WP_DESKTOP = 'WinPhoneDesktop'),
      ($.system.MAC = 'Mac OS'),
      ($.system.IOS = 'iPhone OS'),
      ($.system.LINUX = 'Linux'),
      ($.system.ANDROID = 'Android'),
      ($.system.BLACKBERRY = 'BlackBerry');

    if (/windows/.test(sUserAgent)) {
      $.system.name = $.system.WINDOWS;
      $.system.version = getSystemVersionCode(/windows nt\s?\d+\.?\d?/);
    }

    if (/windows phone/.test(sUserAgent)) {
      $.system.name = $.system.WP;
      $.system.version = getSystemVersionCode(/windows phone\s?\d+\.?\d?/);
    }

    if (/wpdesktop/.test(sUserAgent)) {
      $.system.name = $.system.WP_DESKTOP;
      $.system.version = getSystemVersionCode(/wpdesktop\s?\d+\.?\d?/);
    }

    if ($.system.name != $.system.WP) {
      if (/iphone/.test(sUserAgent) || /ipad/.test(sUserAgent)) {
        $.system.name = $.system.IOS;
        $.system.version = getSystemVersionCode(/os\s?\d+_?\d?/);
      }

      if (/macintosh/.test(sUserAgent) && isPad) {
        $.system.name = $.system.IOS;
        $.system.version = getSystemVersionCode(/version\/\s?\d+_?\d?/);
      }

      if (/android/.test(sUserAgent)) {
        $.system.name = $.system.ANDROID;
        $.system.version = getSystemVersionCode(/android\s?\d+\.?\d?/);
      }
    }

    if (/mac/.test(sUserAgent) && $.browser.system != $.browser.IOS) {
      $.system.name = $.system.MAC;
      $.system.version = getSystemVersionCode(/os x\s?\d+\.?\d?/);
    }

    if (/linux/.test(sUserAgent) && !/android/.test(sUserAgent)) {
      $.system.name = $.system.LINUX;
    }

    if (/blackberry/.test(sUserAgent)) {
      $.system.name = $.system.BLACKBERRY;
      $.system.version = getSystemVersionCode(/blackberry\s?\d+/);
    }
  }
})(_agent_);

var $ = window.jQuery;

var isFirefox = function () {
  return _agent_.browser.firefox;
};

var isIE = function () {
  return _agent_.browser.msie;
};

var isIE8 = function () {
  return _agent_.browser.msie && _agent_.browser.version == 8;
};

var isIE9 = function () {
  return _agent_.browser.msie && _agent_.browser.version == 9;
};

var isIE11 = function () {
  return _agent_.browser.msie && _agent_.browser.version == 11;
};

var isBelowIE11 = function () {
  return _agent_.browser.msie && _agent_.browser.version < 11;
};

var isPad = function () {
  if (_agent_.browser.device == _agent_.browser.DEVICE_PAD) return true;
  if (
    _agent_.browser.device == _agent_.browser.DEVICE_PC &&
    _agent_.system.name == _agent_.system.ANDROID
  )
    return true;
  return false;
};

var isIpad = function () {
  var userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf('ipad') > 0 && userAgent.indexOf('safari') > 0;
};

var isPC = function () {
  if (isPhone() || isPad()) return false;

  return _agent_.browser.device == _agent_.browser.DEVICE_PC ? true : false;
};

var isIpod = function () {
  var userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf('ipod') > 0;
};

var isIphone = function () {
  var userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf('iphone') > 0;
};

var isIphoneXor11 = function () {
  return (
    isIphone() &&
    ((screen.height == 812 && screen.width == 375) ||
      (screen.height == 896 && screen.width == 414) ||
      _agent_.system.version >= 12)
  );
};

var isNokiaPhone = function () {
  //windows phone
  var userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf('msie') > 0 && userAgent.indexOf('wpdesktop') > 0;
};

var isAndroid = function () {
  var userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf('android') > -1 || userAgent.indexOf('adr') > -1;
};

var isPhone = function () {
  var search = window.location.search;

  if (_agent_.browser.device == _agent_.browser.DEVICE_PHONE) {
    return true;
  }

  if (
    search.toLowerCase().indexOf('phone=true') >= 0 ||
    search.toLowerCase().indexOf('phonebook=true') >= 0
  ) {
    return true;
  }
  return false;
};

var isAndroidWeChat = function () {
  return (
    _agent_.system.name == _agent_.system.ANDROID &&
    _agent_.browser.chrome &&
    _agent_.browser.version < 40
  );
};

var isWeChat = function () {
  return _agent_.browser.wechat;
};

var isDingDing = function () {
  return _agent_.browser.dingding;
};

var isAndroidDefault = function () {
  return _agent_.system.name == _agent_.system.ANDROID && _agent_.browser.safari;
};

var isPhoneBook = function () {
  if (_agent_.system.name == _agent_.system.ANDROID) {
    //if(_agent_.browser.safari) return true;
    //if(_agent_.browser.chrome && _agent_.browser.version < 40) return true;
    if (_agent_.browser.uc) return true;
  }
  var search = window.location.search;

  if (
    (isPhone() || isPad()) &&
    _agent_.system.name == _agent_.system.ANDROID &&
    parseInt(_agent_.system.version) < 4
  ) {
    return true;
  }
  if (search.toLowerCase().indexOf('phonebook=true') >= 0) {
    return true;
  }
  if ((isPhone() || isPad()) && bookConfig.FlipStyle.toLowerCase() == 'slide') {
    return true;
  }
  return false;
};

var isHigherThanIOS8 = function () {
  return _agent_.system.name == _agent_.system.IOS && _agent_.system.version >= 8;
};

var isInTheFrame = function () {
  return window.top != window;
};

function isBelowIE9() {
  if (_agent_.browser.msie) {
    if (_agent_.browser.version < 9) {
      return true;
    } else return false;
  } else return false;
}

function isBelowIE8() {
  if (_agent_.browser.msie) {
    if (_agent_.browser.version < 8) {
      return true;
    } else return false;
  } else return false;
}

function isBelowIE10() {
  if (_agent_.browser.msie) {
    if (_agent_.browser.version < 10) {
      return true;
    } else return false;
  } else return false;
}

function isMacOSChrome() {
  var userAgent = navigator.userAgent.toLowerCase();
  var isMacOS = /macintosh/.test(userAgent);
  return isMacOS && _agent_.browser.chrome;
}

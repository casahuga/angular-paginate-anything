(function () {
    'use strict';

    // 1 2 5 10 25 50 100 250 500 etc
    function quantizedNumber(i) {
        var adjust = [1, 2.5, 5];
        return Math.floor(Math.pow(10, Math.floor(i / 3)) * adjust[i % 3]);
    }

    // the j such that quantizedNumber(j) is closest to i
    function quantizedIndex(i) {
        if (i < 1) {
            return 0;
        }
        var group = Math.floor(Math.log(i) / Math.LN10),
                offset = i / (2.5 * Math.pow(10, group));
        if (offset >= 3) {
            group++;
            offset = 0;
        }
        return 3 * group + Math.round(Math.min(2, offset));
    }

    function quantize(i) {
        if (i === Infinity) {
            return Infinity;
        }
        return quantizedNumber(quantizedIndex(i));
    }

    // don't overwrite default response transforms
    function appendTransform(defaults, transform) {
        defaults = angular.isArray(defaults) ? defaults : [defaults];
        return (transform) ? defaults.concat(transform) : defaults;
    }

    angular.module('mmf.paginateAnything', []).
            directive('mmfPagination', function () {
                var defaultLinkGroupSize = 3, defaultClientLimit = 250, defaultPerPage = 50;

                return {
                    restrict: 'AE',
                    scope: {
                        // required
                        url: '=',
                        collection: '=',
                        navigationParams: '=',
                        // optional
                        urlParams: '=?',
                        headers: '=?',
                        page: '=?',
                        perPage: '=?',
                        perPagePresets: '=?',
                        autoPresets: '=?',
                        clientLimit: '=?',
                        linkGroupSize: '=?',
                        reloadPage: '=?',
                        size: '=?',
                        passive: '@',
                        transformResponse: '=?',
                        // directive -> app communication only
                        numPages: '=?',
                        numItems: '=?',
                        serverLimit: '=?',
                        rangeFrom: '=?',
                        rangeTo: '=?'
                    },
                    templateUrl: function (element, attr) {
                        return attr.templateUrl || 'paginate_basic.html';
                    },
                    replace: true,
                    controller: ['$scope', '$http', function ($scope, $http) {
                            $scope.firstRequest = false;
                            $scope.reloadPage = false;
                            $scope.serverLimit = Infinity; // it's not known yet
                            $scope.Math = window.Math; // Math for the template

                            if (typeof $scope.autoPresets !== 'boolean') {
                                $scope.autoPresets = true;
                            }

                            var lgs = $scope.linkGroupSize, cl = $scope.clientLimit;
                            $scope.linkGroupSize = typeof lgs === 'number' ? lgs : defaultLinkGroupSize;
                            $scope.clientLimit = typeof cl === 'number' ? cl : defaultClientLimit;

                            $scope.updatePresets = function () {
                                if ($scope.autoPresets) {
                                    var presets = [], i;
                                    for (i = Math.min(3, quantizedIndex($scope.navigationParams.perPage || defaultPerPage));
                                            i <= quantizedIndex(Math.min($scope.clientLimit, $scope.serverLimit));
                                            i++) {
                                        presets.push(quantizedNumber(i));
                                    }
                                    $scope.perPagePresets = presets;
                                } else {
                                    $scope.perPagePresets = $scope.perPagePresets.filter(
                                            function (preset) {
                                                return preset <= $scope.serverLimit;
                                            }
                                    ).concat([$scope.serverLimit]);
                                }
                            };

                            $scope.gotoPage = function (i) {
                                if (i < 0 || i * $scope.navigationParams.perPage >= $scope.numItems) {
                                    return;
                                }
                                $scope.navigationParams.page = i;
                            };

                            $scope.linkGroupFirst = function () {
                                var rightDebt = Math.max(0,
                                        $scope.linkGroupSize - ($scope.numPages - 1 - ($scope.navigationParams.page + 2))
                                        );
                                return Math.max(0,
                                        $scope.navigationParams.page - ($scope.linkGroupSize + rightDebt)
                                        );
                            };

                            $scope.linkGroupLast = function () {
                                var leftDebt = Math.max(0,
                                        $scope.linkGroupSize - ($scope.navigationParams.page - 2)
                                        );
                                return Math.min($scope.numPages - 1,
                                        $scope.navigationParams.page + ($scope.linkGroupSize + leftDebt)
                                        );
                            };

                            $scope.isFinite = function () {
                                return $scope.numPages < Infinity;
                            };

                            function getFilterAndRequestVars(request) {
                                var filterVars = {'from': request.from, 'to': request.to};
                                angular.forEach($scope.navigationParams, function (value, key) {
                                    if (key !== 'page' && key !== 'perPage') {
                                        filterVars[key] = value;
                                    }
                                });
                                return filterVars;
                            }

                            function requestRange(request) {
                                $scope.$emit('pagination:loadStart', request);
                                var filterVars = getFilterAndRequestVars(request);
                                $http({
                                    method: 'POST',
                                    url: $scope.url,
                                    data: filterVars,
                                    transformResponse: appendTransform($http.defaults.transformResponse, $scope.transformResponse)
                                }).success(function (data, status, headers, config) {
                                    var response = {'from': data.from, 'to': data.to, 'total': data.total}
                                    if (status === 204 || (response && response.total === 0)) {
                                        $scope.numItems = 0;
                                        $scope.collection = [];
                                    } else {
                                        $scope.numItems = response ? response.total : data.length;
                                        $scope.collection = data || [];
                                    }

                                    if (response) {
                                        $scope.rangeFrom = response.from;
                                        $scope.rangeTo = response.to;
                                        if (length(response) < response.total) {
                                            if (
                                                    (request.to < response.total - 1) ||
                                                    (response.to < response.total - 1 && response.total < request.to)
                                                    ) {
                                                if (!$scope.navigationParams.perPage || length(response) < $scope.navigationParams.perPage) {
                                                    if ($scope.autoPresets) {
                                                        var idx = quantizedIndex(length(response));
                                                        if (quantizedNumber(idx) > length(response)) {
                                                            idx--;
                                                        }
                                                        $scope.serverLimit = quantizedNumber(idx);
                                                    } else {
                                                        $scope.serverLimit = length(response);
                                                    }
                                                    $scope.navigationParams.perPage = $scope.Math.min(
                                                            $scope.serverLimit,
                                                            $scope.clientLimit
                                                            );
                                                }
                                            }
                                        }
                                    }
                                    $scope.numPages = Math.ceil($scope.numItems / ($scope.navigationParams.perPage || defaultPerPage));

                                    $scope.$emit('pagination:loadPage', status, config);
                                }).error(function (data, status, headers, config) {
                                    $scope.$emit('pagination:error', status, config);
                                });
                            }
                            $scope.size = $scope.size || 'md';
                            if ($scope.autoPresets) {
                                $scope.updatePresets();
                            }

                            $scope.$watch('navigationParams', function (navigationParams) {
                                requestRange({
                                    from: $scope.navigationParams.page * $scope.navigationParams.perPage,
                                    to: ($scope.navigationParams.page + 1) * $scope.navigationParams.perPage - 1
                                });
                            }, true);

                            $scope.$watch('url', function (newUrl, oldUrl) {
                                if ($scope.passive === 'true') {
                                    return;
                                }

                                if (newUrl !== oldUrl) {
                                    if ($scope.navigationParams.page === 0) {
                                        $scope.reloadPage = true;
                                    } else {
                                        $scope.navigationParams.page = 0;
                                    }
                                }
                            });

                            var pp = $scope.navigationParams.perPage || defaultPerPage;

                            if ($scope.autoPresets) {
                                pp = quantize(pp);
                            }
                        }]
                };
            }).
            filter('makeRange', function () {
                // http://stackoverflow.com/a/14932395/3102996
                return function (input) {
                    var lowBound, highBound;
                    switch (input.length) {
                        case 1:
                            lowBound = 0;
                            highBound = parseInt(input[0], 10) - 1;
                            break;
                        case 2:
                            lowBound = parseInt(input[0], 10);
                            highBound = parseInt(input[1], 10);
                            break;
                        default:
                            return input;
                    }
                    var result = [];
                    for (var i = lowBound; i <= highBound; i++) {
                        result.push(i);
                    }
                    return result;
                };
            });


    function parseRange(hdr) {
        var m = hdr && hdr.match(/^(?:items )?(\d+)-(\d+)\/(\d+|\*)$/);
        if (m) {
            return {
                from: +m[1],
                to: +m[2],
                total: m[3] === '*' ? Infinity : +m[3]
            };
        } else if (hdr === '*/0') {
            return {total: 0};
        }
        return null;
    }

    function length(range) {
        return range.to - range.from + 1;
    }
}());


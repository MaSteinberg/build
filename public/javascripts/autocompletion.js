;(function($){
    var autoNS = odkmaker.namespace.load('odkmaker.autocompletion');
    autoNS.cache = {};

    //Adapted from https://www.w3schools.com/howto/howto_js_autocomplete.asp
    function activateAutocompletion(inp, arr) {
        /*the autocomplete function takes two arguments,
        the text field element and an array of possible autocompleted values:*/
        var currentFocus;
        /*execute a function when someone writes in the text field:*/
        inp.addEventListener("input", function(e) {
            var a, b, i, val = this.value;
            /*close any already open lists of autocompleted values*/
            closeAllLists();
            if (!val) { return false;}
            currentFocus = -1;
            /*create a DIV element that will contain the items (values):*/
            a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-items");
            /*append the DIV element as a child of the autocomplete container:*/
            this.parentNode.appendChild(a);
            /*for each item in the array...*/
            for (i = 0; i < arr.length; i++) {
                /*check if the item starts with the same letters as the text field value:*/
                if (arr[i].label.substr(0, val.length).toUpperCase() == val.toUpperCase()) {
                    /*create a DIV element for each matching element:*/
                    b = document.createElement("DIV");
                    /*make the matching letters bold:*/
                    b.innerHTML = "<strong>" + arr[i].label.substr(0, val.length) + "</strong>";
                    b.innerHTML += arr[i].label.substr(val.length);
                    /*insert a input field that will hold the current array item's value:*/
                    b.innerHTML += "<input type='hidden' value='" + arr[i].value + "'>";
                    /*execute a function when someone clicks on the item value (DIV element):*/
                        b.addEventListener("click", function(e) {
                        /*insert the value for the autocomplete text field:*/
                        inp.value = this.getElementsByTagName("input")[0].value;
                        //Trigger the input event so data-properties are updated properly
                        $(inp).trigger('input');
                        /*close the list of autocompleted values,
                        (or any other open lists of autocompleted values:*/
                        closeAllLists();
                    });
                    a.appendChild(b);
                }
            }
        });
        /*execute a function presses a key on the keyboard:*/
        inp.addEventListener("keydown", function(e) {
            var x = document.getElementById(this.id + "autocomplete-list");
            if (x) x = x.getElementsByTagName("div");
            if (e.keyCode == 40) {
                /*If the arrow DOWN key is pressed,
                increase the currentFocus variable:*/
                currentFocus++;
                /*and and make the current item more visible:*/
                addActive(x);
            } else if (e.keyCode == 38) { //up
                /*If the arrow UP key is pressed,
                decrease the currentFocus variable:*/
                currentFocus--;
                /*and and make the current item more visible:*/
                addActive(x);
            } else if (e.keyCode == 13) {
                /*If the ENTER key is pressed, prevent the form from being submitted,*/
                e.preventDefault();
                if (currentFocus > -1) {
                    /*and simulate a click on the "active" item:*/
                    if (x) x[currentFocus].click();
                }
            }
        });
        function addActive(x) {
            /*a function to classify an item as "active":*/
            if (!x) return false;
            /*start by removing the "active" class on all items:*/
            removeActive(x);
            if (currentFocus >= x.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (x.length - 1);
            /*add class "autocomplete-active":*/
            x[currentFocus].classList.add("autocomplete-active");
        }
        function removeActive(x) {
            /*a function to remove the "active" class from all autocomplete items:*/
            for (var i = 0; i < x.length; i++) {
                x[i].classList.remove("autocomplete-active");
            }
        }
        function closeAllLists(elmnt) {
            /*close all autocomplete lists in the document,
            except the one passed as an argument:*/
            var x = document.getElementsByClassName("autocomplete-items");
            for (var i = 0; i < x.length; i++) {
                if (elmnt != x[i] && elmnt != inp) {
                    x[i].parentNode.removeChild(x[i]);
                }
            }
        }
        /*execute a function when someone clicks in the document:*/
        document.addEventListener("click", function (e) {
            closeAllLists(e.target);
        });
    } 

    $.fn.extend({
        semanticAutocompletion: function(property){
            var autocompletionArray;
            if(autoNS.cache[property]){
                autocompletionArray = getControlReferenceAutocompletion().concat(autoNS.cache[property]);
            } else{
                autocompletionArray = getControlReferenceAutocompletion();
            }
            return this.each(function(){
                activateAutocompletion(this, autocompletionArray);
            });
        }
    });

    /* Function to pull the autocompletion terms from the referenced aggregate server*/
    autoNS.getSemanticAutocompletion = function(property){
        var protocol = odkmaker.application.serverProtocol;
        var target = odkmaker.application.serverAddress;

        if(protocol && target){
            $.ajax({
                type: 'GET',
                url: protocol + '://' + target + '/semanticAutocomplete',
                data: {
                    "semanticProperty": property,
                    "prefixed": true
                },
                dataType: 'json',
                success: function(list){
                    //If a term doesn't have a label we try to use the last part of its URI
                    for (let i = 0; i < list.length; i++) {   
                        if(list[i].label === null || list[i].label === ""){
                            var uri = list[i].value;
                            var separatorIndex = Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/"));
                            list[i].label = uri.substring(separatorIndex+1, uri.length);
                            if(list[i].label === "" || separatorIndex == -1){
                                //Strange URI, can't extract label, use URI as label but cut any prefixes
                                list[i].label = list[i].value.replace(/^_[^_]*_/, "");
                            }                          
                        }
                    }
                    //We have to "encode" some special characters in the URIs
                    //that are not allowed in single-/multiple-choice-questions
                    for (let i = 0; i < list.length; i++) {
                        list[i].value = encodeUri(list[i].value);  
                    }
                    //Add terms to autocompletion cache. The list might intentionally be empty!
                    autoNS.cache[property] = list;
                    //Activate autocompletion in case a property-editor is currently active
                    var $inputContainer = $('.semanticsAdvanced .semanticProperties .propertyItem div').filter(function(){
                        return $(this).data('name') == odkmaker.data.semantics.semPropertyPrefix+property;
                    });
                    $inputContainer.find('input').semanticAutocompletion(property);
                    //Add the terms as presets for single- & multiple-choice questions
                    if(list.length > 0){
                        odkmaker.options.addPreset({
                            name: property,
                            elements: list
                        });
                    }
                },
                error: function(jqXHR, textStatus, errorThrown ){
                    autoNS.cache[property] = [];
                }
            });
        }
    }

    /**
     * Encodes given URI with characters that are allowed in single- and multiple-choice questions.
     * 
     * @param {string} uri 
     * 
     * @returns {string} Encoded URI
     */
    function encodeUri(uri){
        return uri.replace(/:/g, "__")
                  .replace(/\//g, "--")
                  .replace(/#/g, "_-_");
    }

    /**
     * Finds the names of all controls in the workspace.
     * 
     * @returns {Array<string>}
     */
    function getAllControlNames(){
        var controlNames = [];
        /*Not using the odkmaker.data.extract function here because it does 
        a lot more than we actually need*/
        $('.workspace .control').each(function(){
            var controlName = $(this).data('odkControl-properties').name.value;
            controlNames.push(controlName);
        });
        return controlNames;
    }


    /**
     * Gets an autocompletion list containing all controls that we can reference.
     * 
     * @returns {Array<Object<value: Prefixed control reference, label: Label for control reference>>} Autocompletion list
     */
    function getControlReferenceAutocompletion(){
        var controlNames = getAllControlNames();
        var autocompletion = [];
        for(var i = 0; i < controlNames.length; i++){
            autocompletion.push({
                value: odkmaker.data.semantics.columnReferencePrefix + controlNames[i],
                label: controlNames[i] + " (Reference to question)"
            });
        }
        return autocompletion;
    }
})(jQuery);